"""Battery percentages reported by cameras paired with the HomeBase."""

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import PERCENTAGE
from homeassistant.core import callback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import DOMAIN, RTC_CONNECTION_ERRORS, camera_device_info
from .guard_mode import watch_homebase
from .udp_diagnostic import UDP_STATUSES, UdpDiagnosticEntity, ice_attempt, udp_report, window_ice_attempts

STUN_ATTRIBUTES = {
    "stun_requests_sent": "requestsSent",
    "stun_requests_received": "requestsReceived",
    "stun_successes_sent": "successesSent",
    "stun_successes_received": "successesReceived",
    "stun_errors_sent": "errorsSent",
    "stun_errors_received": "errorsReceived",
}


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    _watch_batteries(hass.data[DOMAIN], async_add_entities)


async def async_setup_entry(hass, entry, async_add_entities):
    entry.async_on_unload(_watch_batteries(entry.runtime_data, async_add_entities, paired=True))
    entry.async_on_unload(watch_homebase(entry.runtime_data, async_add_entities, UdpLinkResult, supports=udp_report))


class UdpLinkResult(UdpDiagnosticEntity, SensorEntity):
    _attr_translation_key = "udp_diagnostic"
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = UDP_STATUSES
    _attr_icon = "mdi:lan-connect"

    def __init__(self, coordinator, serial):
        super().__init__(coordinator, serial)
        self._attr_unique_id = f"eufy_bridge_udp_result_{serial}"

    @property
    def native_value(self):
        return self._report.get("status")

    @property
    def extra_state_attributes(self):
        report = self._report
        if not report:
            return {}
        interfaces = report.get("interfaces", [])
        attributes = {
            "sent_by_interface": {item["name"]: item["sent"] for item in interfaces},
            "received_by_interface": {item["name"]: item["received"] for item in interfaces},
            "started_at": report.get("startedAt"),
            "finished_at": report.get("finishedAt"),
        }
        trial = report.get("windowsLanTrial")
        if isinstance(trial, dict) and trial.get("status") in (
            "running", "connected", "failed", "skipped_online", "busy", "error", "inconclusive"
        ):
            attributes["windows_lan_trial"] = trial["status"]
            reason = trial.get("reason")
            if isinstance(reason, str) and (reason in RTC_CONNECTION_ERRORS or reason in (
                "route_unavailable", "pair_mismatch", "pair_unverified", "trial_timeout", "trial_unavailable"
            )):
                attributes["windows_lan_trial_reason"] = reason
            observed = ice_attempt(trial.get("iceAttempt"))
            if observed is not None:
                attributes["windows_lan_ice_attempt"] = observed
        if report.get("status") in ("bidirectional", "outbound_only", "inbound_only", "no_traffic"):
            attempts = window_ice_attempts(report.get("iceAttempts"))
            if attempts is not None:
                attributes["ice_attempts"] = attempts
            stun = report.get("stun")
            if isinstance(stun, dict) and all(type(stun.get(key)) is int and stun[key] >= 0
                                              for key in STUN_ATTRIBUTES.values()):
                attributes.update({attr: stun[key] for attr, key in STUN_ATTRIBUTES.items()})
        if report.get("reason") in ("address_unavailable", "capture_unavailable", "station_changed", "connection_unavailable"):
            attributes["reason"] = report["reason"]
        return attributes


@callback
def _watch_batteries(coordinator, async_add_entities, *, paired=False):
    known = set()

    @callback
    def discover():
        new = []
        for device in (coordinator.data or {}).get("devices", []):
            serial = device.get("id")
            if (serial and serial not in known and device.get("kind") == "camera"
                    and device.get("model") and device.get("power") != "poe"):
                known.add(serial)
                new.append(CameraBattery(coordinator, device, paired))
        if new:
            async_add_entities(new)

    return coordinator.async_watch_inventory(discover)


class CameraBattery(CoordinatorEntity, SensorEntity):
    """Latest battery reading reported for a camera."""

    _attr_device_class = SensorDeviceClass.BATTERY
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, device, paired):
        super().__init__(coordinator)
        self._serial = device["id"]
        self._attr_unique_id = f"eufy_bridge_battery_{self._serial}"
        self._attr_name = f"Eufy batterie {device.get('name') or self._serial}"
        if paired:
            self._attr_device_info = camera_device_info(device)

    @property
    def native_value(self):
        for device in (self.coordinator.data or {}).get("devices", []):
            if device.get("id") == self._serial and device.get("power") != "poe":
                value = device.get("reported", {}).get("battery")
                if type(value) is int and 0 <= value <= 100:
                    return value
        return None

    @property
    def available(self):
        return super().available and self.native_value is not None
