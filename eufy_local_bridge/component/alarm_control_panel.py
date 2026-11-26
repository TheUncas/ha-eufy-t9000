"""Verified alarm mode and commands for the selected HomeBase."""

from homeassistant.components.alarm_control_panel import (
    AlarmControlPanelEntity,
    AlarmControlPanelEntityFeature,
    AlarmControlPanelState,
)
from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import DOMAIN


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    _watch_alarm(hass.data[DOMAIN], async_add_entities)


async def async_setup_entry(hass, entry, async_add_entities):
    entry.async_on_unload(_watch_alarm(entry.runtime_data, async_add_entities))


@callback
def _watch_alarm(coordinator, async_add_entities):
    known = set()

    @callback
    def discover():
        station = (coordinator.data or {}).get("station") or {}
        serial = station.get("id")
        if serial and station.get("model") == "T9000" and serial not in known:
            known.add(serial)
            async_add_entities([HomeBaseAlarm(coordinator, serial)])

    return coordinator.async_watch_inventory(discover)


class HomeBaseAlarm(CoordinatorEntity, AlarmControlPanelEntity):
    """A command may reconnect the base; only a live report confirms its mode."""

    _attr_name = "Alarme T9000"
    _attr_code_arm_required = False

    def __init__(self, coordinator, serial):
        super().__init__(coordinator)
        self._serial = serial
        self._attr_unique_id = f"eufy_bridge_alarm_{serial}"

    @property
    def _station(self):
        station = (self.coordinator.data or {}).get("station") or {}
        return station if station.get("id") == self._serial else {}

    @property
    def _modes(self):
        return self._station.get("settings", {}).get("guardMode", {}).get("states", {})

    @property
    def available(self):
        data = self.coordinator.data or {}
        return bool(super().available and data.get("connected") and
                    data.get("auth", {}).get("status") == "connected" and
                    any(mode in self._modes for mode in ("0", "1", "63")))

    @property
    def alarm_state(self):
        station = self._station
        if not station.get("online"):
            return None
        properties = station.get("properties", {})
        if properties.get("alarm") is True:
            return AlarmControlPanelState.TRIGGERED
        current = properties.get("currentMode")
        if type(current) is not int:
            return None
        return {
            0: AlarmControlPanelState.ARMED_AWAY,
            1: AlarmControlPanelState.ARMED_HOME,
            3: AlarmControlPanelState.ARMED_CUSTOM_BYPASS,
            4: AlarmControlPanelState.ARMED_CUSTOM_BYPASS,
            5: AlarmControlPanelState.ARMED_CUSTOM_BYPASS,
            63: AlarmControlPanelState.DISARMED,
        }.get(current)

    @property
    def supported_features(self):
        features = AlarmControlPanelEntityFeature(0)
        if "0" in self._modes:
            features |= AlarmControlPanelEntityFeature.ARM_AWAY
        if "1" in self._modes:
            features |= AlarmControlPanelEntityFeature.ARM_HOME
        return features

    async def _set_mode(self, mode):
        if not self.available or str(mode) not in self._modes:
            raise HomeAssistantError("Ce mode de l’alarme est indisponible.")
        await self.coordinator.async_set_mode(mode)

    async def async_alarm_arm_away(self, code=None):
        await self._set_mode(0)

    async def async_alarm_arm_home(self, code=None):
        await self._set_mode(1)

    async def async_alarm_disarm(self, code=None):
        await self._set_mode(63)
