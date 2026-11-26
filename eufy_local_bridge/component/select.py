"""Select any guard profile advertised by the HomeBase."""
from homeassistant.components.select import SelectEntity

from . import DOMAIN
from .guard_mode import HomeBaseModeEntity, watch_homebase


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    watch_homebase(hass.data[DOMAIN], async_add_entities, HomeBaseGuardMode)


async def async_setup_entry(hass, entry, async_add_entities):
    entry.async_on_unload(watch_homebase(entry.runtime_data, async_add_entities, HomeBaseGuardMode))


class HomeBaseGuardMode(HomeBaseModeEntity, SelectEntity):
    _attr_name = "Mode de garde T9000"
    _attr_icon = "mdi:shield-home"

    def __init__(self, coordinator, serial):
        super().__init__(coordinator, serial)
        self.entity_id = "select.mode_de_garde_t9000"
        self._attr_unique_id = f"eufy_bridge_guard_mode_{serial}"

    @property
    def options(self):
        return list(self._modes.values())

    @property
    def current_option(self):
        return self._configured_option

    async def async_select_option(self, option):
        mode = next((mode for mode, label in self._modes.items() if label == option), None)
        await self._set_mode(mode)
