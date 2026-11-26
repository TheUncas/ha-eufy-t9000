"""Batteries et alarme de la passerelle locale eufy."""
from datetime import timedelta
from ipaddress import IPv4Address, IPv4Network
import logging
import re
import ssl

from aiohttp import ClientError, ClientTimeout, Fingerprint, ServerFingerprintMismatch
try:
    import probatio as vol
except ImportError:
    import voluptuous as vol

from homeassistant.const import EVENT_HOMEASSISTANT_STOP, Platform
from homeassistant.core import callback
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers import config_validation as cv, discovery
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from .addon_client import ORIGIN

DOMAIN = "eufy_local_bridge"
_LOGGER = logging.getLogger(__name__)
_ENTRY_PLATFORMS = (Platform.SENSOR, Platform.ALARM_CONTROL_PANEL, Platform.SELECT, Platform.CAMERA,
                    Platform.BINARY_SENSOR, Platform.BUTTON)
RTC_CONNECTION_ERRORS = {
    "sign_unauthorized": "eufy a refusé l’autorisation de la session. Vérifiez les droits de votre compte sur la HomeBase.",
    "sign_refused": "eufy a refusé l’ouverture de la liaison. Vérifiez que ce compte voit la HomeBase dans eufy Security.",
    "rtc_auth": "La liaison eufy n’a pas pu être authentifiée. Vérifiez que la session eufy du module est active.",
    "peer_unavailable": "La HomeBase ne répond pas à la connexion sécurisée. Vérifiez son alimentation et sa connexion réseau.",
    "region_unavailable": "Le service régional eufy est introuvable. Vérifiez le pays du compte et l’accès Internet du module.",
    "signaling_unavailable": "Le service de signalisation eufy est indisponible. Vérifiez la connexion Internet du module.",
    "hub_unreachable": "La HomeBase n’a pas répondu à la demande de liaison. Vérifiez qu’elle est en ligne dans eufy Security.",
    "offer_unavailable": "La négociation de la liaison a expiré après la réponse de la HomeBase. Vérifiez sa connexion réseau.",
    "answer_unavailable": "L’échange des paramètres de connexion avec la HomeBase a échoué. Vérifiez la connexion réseau de la base et du module.",
    "ice_unavailable": "Le chemin réseau local vers la HomeBase est indisponible. Vérifiez que le module peut la joindre sur le LAN.",
    "no_lan_candidate": "La HomeBase n’a proposé aucune adresse locale. Vérifiez que le module et la base peuvent communiquer sur le LAN.",
    "secure_channel_unavailable": "Le canal sécurisé avec la HomeBase n’a pas pu s’ouvrir. Vérifiez la connectivité entre la base et le module.",
}
_BEFORE_SEND_ERRORS = {
    **RTC_CONNECTION_ERRORS,
    "connector_unavailable": "Le connecteur eufy est indisponible. Vérifiez son état dans le journal de la passerelle.",
    "homebase_unavailable": "La passerelle ne trouve pas la HomeBase T9000. Vérifiez que le compte eufy a accès à cette base.",
    "homebase_unreachable": "La HomeBase est injoignable. Vérifiez son alimentation et la liaison réseau avec la passerelle.",
}
_VERIFY_MODE = "Vérifiez le mode dans eufy Security avant de réessayer."
_UNKNOWN_RESULT = "Résultat de la commande inconnu. " + _VERIFY_MODE


async def _alarm_error(response):
    try:
        data = await response.json()
    except (ClientError, ValueError, TimeoutError):
        return _UNKNOWN_RESULT
    reason = data.get("reason") if isinstance(data, dict) else None
    if isinstance(reason, str) and reason in _BEFORE_SEND_ERRORS:
        return "Commande non envoyée. " + _BEFORE_SEND_ERRORS[reason]
    if reason == "command_unconfirmed":
        return "La HomeBase n’a pas confirmé la commande. " + _VERIFY_MODE
    return _UNKNOWN_RESULT


def _local_ip(value):
    ip = IPv4Address(value)
    if not ip.is_loopback and not any(ip in IPv4Network(cidr) for cidr in
                                       ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")):
        raise vol.Invalid("Adresse IPv4 locale de la passerelle requise")
    return str(ip)


CONFIG_SCHEMA = vol.Schema({
    DOMAIN: vol.Schema({
        vol.Required("host"): vol.All(cv.string, _local_ip),
        vol.Optional("port", default=8787): cv.port,
        vol.Required("token"): vol.All(cv.string, vol.Match(r"\A[A-Za-z0-9_-]{32,}\Z")),
    })
}, extra=vol.ALLOW_EXTRA)


class BridgeCoordinator(DataUpdateCoordinator):
    def __init__(self, hass, config, context, *, entry=None):
        super().__init__(hass, _LOGGER, name=DOMAIN, config_entry=entry,
                         update_interval=timedelta(seconds=10), always_update=False)
        self._origin = ORIGIN if entry is not None else f"https://{config['host']}:{config['port']}"
        self._headers = {"Authorization": "Bearer " + config["token"]}
        self._tls = context
        self._session = async_get_clientsession(hass)

    async def _async_update_data(self):
        try:
            async with self._session.get(self._origin + "/api/state", headers=self._headers,
                                         ssl=self._tls, allow_redirects=False,
                                         timeout=ClientTimeout(total=8)) as response:
                if self.config_entry is not None and response.status in (401, 403):
                    raise ConfigEntryAuthFailed("La clé d’appairage de l’application a changé.")
                if response.status != 200:
                    raise UpdateFailed(f"Lecture refusée par la passerelle (HTTP {response.status}).")
                state = await response.json()
        except ServerFingerprintMismatch as err:
            raise ConfigEntryAuthFailed("Vérifiez la nouvelle empreinte dans le journal de l’application.") from err
        except (ClientError, TimeoutError, ValueError) as err:
            raise UpdateFailed("Lecture HTTPS de la passerelle impossible.") from err
        if not isinstance(state, dict) or not isinstance(state.get("devices"), list):
            raise UpdateFailed("Inventaire de la passerelle invalide.")
        if self.config_entry is not None and state.get("auth", {}).get("status") in (
            "reauth_required", "captcha", "verify_code"
        ):
            raise ConfigEntryAuthFailed("eufy demande une nouvelle authentification.")
        return state

    async def async_set_mode(self, mode):
        try:
            async with self._session.post(self._origin + "/api/alarm", headers=self._headers,
                                          ssl=self._tls, allow_redirects=False, json={"mode": mode},
                                          timeout=ClientTimeout(total=65)) as response:
                if response.status in (503, 504):
                    raise HomeAssistantError(await _alarm_error(response))
                if response.status != 202:
                    raise HomeAssistantError(f"Commande refusée par la passerelle (HTTP {response.status}).")
        except (ClientError, TimeoutError):
            raise HomeAssistantError(_UNKNOWN_RESULT) from None
        await self.async_request_refresh()

    async def async_start_udp_diagnostic(self, serial):
        if self.config_entry is None:
            raise HomeAssistantError("Le diagnostic UDP nécessite le module local appairé.")
        try:
            async with self._session.post(
                self._origin + "/api/diagnostics/udp", headers=self._headers, json={"stationId": serial},
                ssl=self._tls, allow_redirects=False, timeout=ClientTimeout(total=8),
            ) as response:
                if response.status != 202:
                    raise HomeAssistantError(f"Diagnostic UDP refusé par le module (HTTP {response.status}).")
        except (ClientError, TimeoutError):
            raise HomeAssistantError("Impossible de confirmer le lancement du diagnostic UDP. Consultez son état.") from None
        await self.async_request_refresh()

    @callback
    def async_watch_inventory(self, listener):
        cancel = self.async_add_listener(listener)
        if self.config_entry is None:
            @callback
            def stop(event):
                cancel()
            self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, stop)
        listener()
        return cancel

    def camera_request(self, serial):
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", serial):
            raise ValueError("Identifiant caméra invalide")
        return self._session.get(
            f"{self._origin}/api/cameras/{serial}/live", headers=self._headers, ssl=self._tls,
            allow_redirects=False, timeout=ClientTimeout(total=None, sock_connect=8, sock_read=80),
        )


async def async_setup(hass, config):
    if DOMAIN not in config:
        return True
    if hass.config_entries.async_entries(DOMAIN):
        _LOGGER.warning("L’entrée de l’application eufy est active. Retirez le bloc YAML de la passerelle")
        return True
    def load_authority():
        return ssl.create_default_context(cafile=hass.config.path("eufy_local_bridge_ca.crt"))

    try:
        context = await hass.async_add_executor_job(load_authority)
    except (OSError, ValueError):
        _LOGGER.error("Impossible de charger eufy_local_bridge_ca.crt dans le dossier de configuration")
        return False
    coordinator = BridgeCoordinator(hass, config[DOMAIN], context)
    hass.data[DOMAIN] = coordinator
    await coordinator.async_register_shutdown()
    await coordinator.async_refresh()
    for platform in (Platform.SENSOR, Platform.ALARM_CONTROL_PANEL, Platform.SELECT):
        hass.async_create_task(discovery.async_load_platform(hass, platform, DOMAIN, {}, config))
    return True


async def async_setup_entry(hass, entry):
    pin = Fingerprint(bytes.fromhex(entry.data["fingerprint"]))
    coordinator = BridgeCoordinator(hass, entry.data, pin, entry=entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, _ENTRY_PLATFORMS)
    return True


async def async_unload_entry(hass, entry):
    return await hass.config_entries.async_unload_platforms(entry, _ENTRY_PLATFORMS)
