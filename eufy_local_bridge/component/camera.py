"""Camera devices, cached PoE previews and on-demand local MJPEG."""
import asyncio
from contextlib import asynccontextmanager

from aiohttp import ClientError, MultipartReader, web
from homeassistant.components.camera import Camera
from homeassistant.core import callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_aiohttp_proxy_stream
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import DOMAIN, camera_device_info
from .poe_snapshots import PoeSnapshots


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = entry.runtime_data
    registry = dr.async_get(hass)
    registered = {}
    known = set()
    previews = PoeSnapshots(lambda serial: _read_frame(coordinator, serial))

    @callback
    def discover():
        state = coordinator.data or {}
        station = state.get("station") or {}
        parent = station.get("id") if station.get("model") == "T9000" else None
        cameras = []
        poe = []
        for device in state.get("devices", []):
            info = camera_device_info(device)
            if not parent or info is None:
                continue
            serial = device["id"]
            identity = (parent, info["name"], info["model"])
            if registered.get(serial) != identity:
                base = registry.async_get_or_create(config_entry_id=entry.entry_id,
                                                    identifiers={(DOMAIN, parent)}, name="HomeBase T9000")
                camera = registry.async_get_or_create(config_entry_id=entry.entry_id, **info)
                if camera.via_device_id != base.id:
                    registry.async_update_device(camera.id, via_device_id=base.id)
                registered[serial] = identity
            if device.get("live") is not True:
                continue
            if device.get("power") == "poe":
                poe.append(serial)
            if serial not in known:
                known.add(serial)
                cameras.append(BridgeCamera(coordinator, device, previews))
        if cameras:
            async_add_entities(cameras)
        previews.update(state, coordinator.last_update_success, poe)

    entry.async_on_unload(coordinator.async_watch_inventory(discover))
    entry.async_on_unload(previews.close)


@asynccontextmanager
async def _stream(coordinator, serial, *, background=False):
    try:
        async with coordinator.camera_request(serial, background=background) as response:
            if response.status != 200 or response.content_type != "multipart/x-mixed-replace":
                raise web.HTTPServiceUnavailable()
            yield response
    except (ClientError, TimeoutError) as err:
        raise web.HTTPServiceUnavailable() from err


async def _read_frame(coordinator, serial):
    """Close the background stream immediately after one bounded JPEG."""
    try:
        async with asyncio.timeout(70), _stream(coordinator, serial, background=True) as response:
            frame = await MultipartReader.from_response(response).next()
            if frame is None or frame.headers.get("Content-Type") != "image/jpeg":
                return None
            length = int(frame.headers.get("Content-Length", 0))
            if not 0 < length <= 8 * 1024 * 1024:
                return None
            image = await frame.read()
            if len(image) == length and image.startswith(b"\xff\xd8") and image.endswith(b"\xff\xd9"):
                return bytes(image)
    except (ValueError, TimeoutError, web.HTTPServiceUnavailable):
        pass
    return None


class BridgeCamera(CoordinatorEntity, Camera):
    """Home Assistant retrieves images on the user's behalf."""

    def __init__(self, coordinator, device, previews):
        super().__init__(coordinator)
        Camera.__init__(self)
        self._serial = device["id"]
        self._previews = previews
        self._attr_device_info = camera_device_info(device)
        self._attr_unique_id = f"eufy_bridge_camera_{self._serial}"
        self._attr_name = device.get("name") or self._serial
        # HA may request thumbnails automatically. A battery camera's video is opt-in.
        self._attr_entity_registry_enabled_default = device.get("power") == "poe" or device.get("source") == "rtsp"

    @property
    def available(self):
        state = self.coordinator.data or {}
        return super().available and any(
            device.get("id") == self._serial and device.get("live") is True
            and (device.get("source") == "rtsp" or (state.get("connected") and state.get("station")))
            for device in state.get("devices", [])
        )

    async def async_camera_image(self, width=None, height=None):
        """HA may request thumbnails automatically. Only return a cached preview."""
        return self._previews.images.get(self._serial)

    async def handle_async_mjpeg_stream(self, request):
        async with _stream(self.coordinator, self._serial) as response:
            return await async_aiohttp_proxy_stream(
                self.hass, request, response.content, response.headers["Content-Type"]
            )
