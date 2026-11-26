"""Pair Home Assistant and complete eufy challenges inside the native setup flow."""
import asyncio
import re

from homeassistant import config_entries
from homeassistant.helpers.selector import TextSelector, TextSelectorConfig, TextSelectorType

from . import DOMAIN, vol
from .addon_client import PairingError, account_request, normalize_pairing

_PASSWORD = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))
_PAIRING = vol.Schema({vol.Required("token"): _PASSWORD, vol.Required("fingerprint"): str})
_ACCOUNT = vol.Schema({
    vol.Required("email"): TextSelector(TextSelectorConfig(type=TextSelectorType.EMAIL)),
    vol.Required("password"): _PASSWORD,
    vol.Required("country"): vol.All(str, vol.Match(r"^[A-Za-z]{2}$")),
})
_CAPTCHA = re.compile(r"data:image/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+")
POLL_INTERVAL = 2
WAIT_TIMEOUT = 90


class BridgeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self):
        self._pairing = None
        self._captcha = ""
        self._submitted = False
        self._poll_task = None

    async def async_step_user(self, user_input=None):
        if self.context["source"] != config_entries.SOURCE_REAUTH:
            if DOMAIN in self.hass.data:
                return self.async_abort(reason="yaml_active")
            await self.async_set_unique_id("local_addon")
            self._abort_if_unique_id_configured()
        errors = {}
        if user_input is not None:
            try:
                self._pairing = normalize_pairing(user_input)
                return await self._next_step()
            except PairingError as err:
                errors["base"] = str(err)
        return self.async_show_form(step_id="user", data_schema=_PAIRING, errors=errors)

    async def async_step_reauth(self, entry_data):
        self._pairing = self._get_reauth_entry().data
        try:
            return await self._next_step()
        except PairingError as err:
            return self.async_show_form(step_id="user", data_schema=_PAIRING, errors={"base": str(err)})

    async def _next_step(self):
        self._submitted = False
        model = await account_request(self.hass, self._pairing, "status")
        if model["status"] == "starting":
            return await self.async_step_waiting()
        return await self._route_status(model)

    async def _route_status(self, model):
        status = model["status"]
        if status == "connected":
            if self.context["source"] == config_entries.SOURCE_REAUTH:
                return self.async_update_reload_and_abort(self._get_reauth_entry(), data_updates=self._pairing)
            return self.async_create_entry(title="HomeBase T9000", data=dict(self._pairing))
        if status == "captcha":
            image = model.get("captcha")
            self._captcha = image if isinstance(image, str) and len(image) <= 1_000_000 and _CAPTCHA.fullmatch(image) else ""
            if not self._captcha:
                return self.async_show_form(step_id="account", data_schema=_ACCOUNT,
                                            errors={"base": "captcha_unavailable"})
            return await self.async_step_captcha()
        if status == "verify_code":
            return await self.async_step_verify_code()
        errors = {"base": "eufy_refused"} if status in ("error", "reauth_required") and self._submitted else {}
        return self.async_show_form(step_id="account", data_schema=_ACCOUNT, errors=errors)

    async def _poll_status(self):
        pending = ("starting", "offline", "disconnected") if self._submitted else ("starting",)
        try:
            async with asyncio.timeout(WAIT_TIMEOUT):
                while True:
                    model = await account_request(self.hass, self._pairing, "status")
                    if model["status"] not in pending:
                        return model
                    await asyncio.sleep(POLL_INTERVAL)
        except TimeoutError:
            return "login_timeout"
        except PairingError as err:
            return str(err)

    async def async_step_waiting(self, user_input=None):
        if self._poll_task is None:
            self._poll_task = self.hass.async_create_task(self._poll_status())
        elif self._poll_task.done():
            return self.async_show_progress_done(next_step_id="login_result")
        return self.async_show_progress(step_id="waiting", progress_action="wait_for_eufy",
                                       progress_task=self._poll_task)

    async def async_step_login_result(self, user_input=None):
        result = self._poll_task.result()
        self._poll_task = None
        if result == "login_timeout":
            return self.async_show_form(step_id="account", data_schema=_ACCOUNT, errors={"base": result})
        if isinstance(result, str):
            return self.async_show_form(step_id="user", data_schema=_PAIRING, errors={"base": result})
        return await self._route_status(result)

    async def async_step_account(self, user_input=None):
        return await self._submit("account", _ACCOUNT, "login", user_input)

    async def async_step_verify_code(self, user_input=None):
        schema = vol.Schema({vol.Required("code"): vol.All(str, vol.Match(r"^\d{6}$"))})
        return await self._submit("verify_code", schema, "challenge", user_input)

    async def async_step_captcha(self, user_input=None):
        schema = vol.Schema({vol.Required("captcha"): vol.All(str, vol.Length(min=1, max=128))})
        return await self._submit("captcha", schema, "challenge", user_input,
                                  {"image": f"![Captcha eufy]({self._captcha})"})

    async def _submit(self, step, schema, endpoint, user_input, placeholders=None):
        errors = {}
        if user_input is not None:
            try:
                await account_request(self.hass, self._pairing, endpoint, user_input)
                self._submitted = True
                return await self.async_step_waiting()
            except PairingError as err:
                if str(err) in ("invalid_token", "invalid_fingerprint"):
                    return self.async_show_form(step_id="user", data_schema=_PAIRING, errors={"base": str(err)})
                errors["base"] = str(err)
        return self.async_show_form(step_id=step, data_schema=schema, errors=errors,
                                    description_placeholders=placeholders)
