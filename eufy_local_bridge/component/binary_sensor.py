"""Contact and motion reports received while the HomeBase is connected."""
from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.core import callback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import camera_device_info


REPORTS = {
    "sensorOpen": ("Ouverture", BinarySensorDeviceClass.OPENING),
    "motionDetected": ("Mouvement", BinarySensorDeviceClass.MOTION),
}


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = entry.runtime_data
    known = set()

    @callback
    def discover():
        state = coordinator.data or {}
        if not state.get("connected") or not (state.get("station") or {}).get("online"):
            return
        sensors = []
        for device in state.get("devices", []):
            serial = device.get("id")
            if not serial:
                continue
            for field in REPORTS:
                if (serial, field) not in known and type(device.get("properties", {}).get(field)) is bool:
                    known.add((serial, field))
                    sensors.append(BridgeBinarySensor(coordinator, device, field))
        if sensors:
            async_add_entities(sensors)

    entry.async_on_unload(coordinator.async_watch_inventory(discover))


class BridgeBinarySensor(CoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device, field):
        super().__init__(coordinator)
        self._serial = device["id"]
        self._attr_device_info = camera_device_info(device)
        self._field = field
        label, self._attr_device_class = REPORTS[field]
        self._attr_name = f"{label} {device.get('name') or self._serial}"
        self._attr_unique_id = f"eufy_bridge_{field}_{self._serial}"

    @property
    def is_on(self):
        state = self.coordinator.data or {}
        if state.get("connected") and (state.get("station") or {}).get("online"):
            for device in state.get("devices", []):
                if device.get("id") == self._serial:
                    value = device.get("properties", {}).get(self._field)
                    return value if type(value) is bool else None
        return None

    @property
    def available(self):
        return super().available and self.is_on is not None
