"""HomeBase guard-mode discovery, reports and commands shared by both controls."""
from collections import Counter
import re

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import DOMAIN


@callback
def watch_homebase(coordinator, async_add_entities, entity_class):
    known = set()

    @callback
    def discover():
        station = (coordinator.data or {}).get("station") or {}
        serial = station.get("id")
        if serial and station.get("model") == "T9000" and serial not in known:
            known.add(serial)
            async_add_entities([entity_class(coordinator, serial)])

    return coordinator.async_watch_inventory(discover)


class HomeBaseModeEntity(CoordinatorEntity):
    def __init__(self, coordinator, serial):
        super().__init__(coordinator)
        self._serial = serial
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, serial)}, name="HomeBase T9000", manufacturer="eufy", model="T9000",
        )

    @property
    def _station(self):
        station = (self.coordinator.data or {}).get("station") or {}
        return station if station.get("id") == self._serial else {}

    @property
    def _modes(self):
        """Map writable mode IDs to unique options within HA's state length limit."""
        states = self._station.get("settings", {}).get("guardMode", {}).get("states", {})
        labels = {}
        for key, label in states.items():
            if not isinstance(key, str) or not re.fullmatch(r"0|[1-9][0-9]{0,15}", key):
                continue
            mode = int(key)
            if mode <= 2**53 - 1:
                labels[mode] = (label.strip() or f"Mode {mode}")[:255]
        counts = Counter(labels.values())
        for mode, label in labels.items():
            # Reserve the prefix for disambiguation even if a custom name already uses it.
            if counts[label] > 1 or label in (STATE_UNKNOWN, STATE_UNAVAILABLE) or re.match(r"\[[0-9]+\] ", label):
                labels[mode] = f"[{mode}] {label}"[:255]
        return labels

    @property
    def _configured_option(self):
        station = self._station
        value = station.get("properties", {}).get("guardMode")
        if value is None:
            value = station.get("reported", {}).get("guardMode")
        return self._modes.get(value) if type(value) is int else None

    @property
    def available(self):
        data = self.coordinator.data or {}
        return bool(super().available and data.get("connected") and
                    data.get("auth", {}).get("status") == "connected" and self._modes)

    async def _set_mode(self, mode):
        if not self.available or mode not in self._modes:
            raise HomeAssistantError("Ce mode de l’alarme est indisponible.")
        await self.coordinator.async_set_mode(mode)
