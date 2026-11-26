"""Start a UDP link test from the paired Home Assistant app."""
from homeassistant.components.button import ButtonEntity
from homeassistant.exceptions import HomeAssistantError

from .guard_mode import watch_homebase
from .udp_diagnostic import UdpDiagnosticEntity, udp_report


async def async_setup_entry(hass, entry, async_add_entities):
    entry.async_on_unload(watch_homebase(entry.runtime_data, async_add_entities, TestUdpLink, supports=udp_report))


class TestUdpLink(UdpDiagnosticEntity, ButtonEntity):
    _attr_translation_key = "test_udp_link"
    _attr_icon = "mdi:lan-check"

    def __init__(self, coordinator, serial):
        super().__init__(coordinator, serial)
        self._attr_unique_id = f"eufy_bridge_udp_test_{serial}"

    async def async_press(self):
        if not self.available:
            raise HomeAssistantError("Le diagnostic UDP est indisponible pour cette HomeBase.")
        if self._report["status"] != "running":
            await self.coordinator.async_start_udp_diagnostic(self._serial)
