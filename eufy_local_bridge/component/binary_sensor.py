"""Contact and motion reports received while the HomeBase is connected."""
from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import DOMAIN, camera_device_info


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
        station = state.get("station") or {}
        if not state.get("connected") or not station.get("id"):
            return
        sensors = []
        for device in state.get("devices", []):
            serial = device.get("id")
            if not serial:
                continue
            for field in REPORTS:
                advertised = field == "motionDetected" and device.get("supportsMotion") is True
                reported = station.get("online") and type(device.get("properties", {}).get(field)) is bool
                if (serial, field) not in known and (advertised or reported):
                    known.add((serial, field))
                    sensors.append(BridgeBinarySensor(coordinator, device, field, station["id"]))
        if sensors:
            async_add_entities(sensors)

    entry.async_on_unload(coordinator.async_watch_inventory(discover))


class BridgeBinarySensor(CoordinatorEntity, BinarySensorEntity):
    def __init__(self, coordinator, device, field, station_id):
        super().__init__(coordinator)
        self._serial = device["id"]
        self._attr_device_info = camera_device_info(device)
        if self._attr_device_info is None and field == "motionDetected":
            self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, station_id)}, name="HomeBase T9000")
        self._field = field
        label, self._attr_device_class = REPORTS[field]
        self._attr_name = f"{label} {device.get('name') or self._serial}"
        self._attr_unique_id = f"eufy_bridge_{field}_{self._serial}"

    @property
    def _device(self):
        return next((device for device in (self.coordinator.data or {}).get("devices", [])
                     if device.get("id") == self._serial), {})

    @property
    def available(self):
        state = self.coordinator.data or {}
        device = self._device
        reported = type(device.get("properties", {}).get(self._field)) is bool
        advertised = self._field == "motionDetected" and device.get("supportsMotion") is True
        return bool(super().available and state.get("connected") and (state.get("station") or {}).get("online")
                    and (advertised or reported))

    @property
    def is_on(self):
        value = self._device.get("properties", {}).get(self._field)
        return value if self.available and type(value) is bool else None

    @property
    def extra_state_attributes(self):
        if self._field == "motionDetected":
            timestamp = self._device.get("reported", {}).get("lastMotionReceivedAt")
            if isinstance(timestamp, str):
                return {"last_motion_received_at": timestamp}
        return None
