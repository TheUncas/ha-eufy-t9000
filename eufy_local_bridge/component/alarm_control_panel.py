"""Verified alarm mode and commands for the selected HomeBase."""

from homeassistant.components.alarm_control_panel import (
    AlarmControlPanelEntity,
    AlarmControlPanelEntityFeature,
    AlarmControlPanelState,
)

from . import DOMAIN, RTC_CONNECTION_ERRORS
from .guard_mode import HomeBaseModeEntity, watch_homebase


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    watch_homebase(hass.data[DOMAIN], async_add_entities, HomeBaseAlarm)


async def async_setup_entry(hass, entry, async_add_entities):
    entry.async_on_unload(watch_homebase(entry.runtime_data, async_add_entities, HomeBaseAlarm))


class HomeBaseAlarm(HomeBaseModeEntity, AlarmControlPanelEntity):
    """A command may reconnect the base; only a live report confirms its mode."""

    _attr_name = "Alarme T9000"
    _attr_code_arm_required = False

    def __init__(self, coordinator, serial):
        super().__init__(coordinator, serial)
        # Keep the original default entity ID when associating the alarm with its device.
        self.entity_id = "alarm_control_panel.alarme_t9000"
        self._attr_unique_id = f"eufy_bridge_alarm_{serial}"

    @property
    def extra_state_attributes(self):
        station = self._station
        online = station.get("online") if self.coordinator.last_update_success else None
        attributes = {"configured_guard_mode": self._configured_option,
                      "homebase_online": online if type(online) is bool else None}
        reason = station.get("connectionIssue")
        if online is False and isinstance(reason, str) and reason in RTC_CONNECTION_ERRORS:
            attributes["connection_issue"] = reason
        return attributes

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
            6: AlarmControlPanelState.DISARMED,
            63: AlarmControlPanelState.DISARMED,
        }.get(current)

    @property
    def supported_features(self):
        features = AlarmControlPanelEntityFeature(0)
        if 0 in self._modes:
            features |= AlarmControlPanelEntityFeature.ARM_AWAY
        if 1 in self._modes:
            features |= AlarmControlPanelEntityFeature.ARM_HOME
        return features

    async def async_alarm_arm_away(self, code=None):
        await self._set_mode(0)

    async def async_alarm_arm_home(self, code=None):
        await self._set_mode(1)

    async def async_alarm_disarm(self, code=None):
        await self._set_mode(63)
