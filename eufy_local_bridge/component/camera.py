"""Camera entities backed by the add-on's authenticated local MJPEG stream."""
from contextlib import asynccontextmanager
import re

from aiohttp import ClientError, MultipartReader, web
from homeassistant.components.camera import Camera
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_aiohttp_proxy_stream
from homeassistant.helpers.update_coordinator import CoordinatorEntity


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = entry.runtime_data
    known = set()

    @callback
    def discover():
        cameras = []
        for device in (coordinator.data or {}).get("devices", []):
            serial = device.get("id")
            if (device.get("kind") == "camera" and device.get("live") is True
                    and isinstance(serial, str) and re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", serial)
                    and serial not in known):
                known.add(serial)
                cameras.append(BridgeCamera(coordinator, device))
        if cameras:
            async_add_entities(cameras)

    entry.async_on_unload(coordinator.async_watch_inventory(discover))


class BridgeCamera(CoordinatorEntity, Camera):
    """Home Assistant retrieves images on the user's behalf."""

    def __init__(self, coordinator, device):
        super().__init__(coordinator)
        Camera.__init__(self)
        self._serial = device["id"]
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

    @asynccontextmanager
    async def _stream(self):
        try:
            async with self.coordinator.camera_request(self._serial) as response:
                if response.status != 200 or response.content_type != "multipart/x-mixed-replace":
                    raise web.HTTPServiceUnavailable()
                yield response
        except (ClientError, TimeoutError) as err:
            raise web.HTTPServiceUnavailable() from err

    async def async_camera_image(self, width=None, height=None):
        """Read one JPEG, then close the upstream request to release the camera."""
        try:
            async with self._stream() as response:
                # FFmpeg's mpjpeg muxer supplies Content-Type and Content-Length on each part.
                frame = await MultipartReader.from_response(response).next()
                if frame is None or frame.headers.get("Content-Type") != "image/jpeg":
                    return None
                length = int(frame.headers.get("Content-Length", 0))
                if not 0 < length <= 8 * 1024 * 1024:
                    return None
                image = await frame.read()
                return bytes(image) if len(image) == length else None
        except (ValueError, web.HTTPServiceUnavailable):
            return None

    async def handle_async_mjpeg_stream(self, request):
        async with self._stream() as response:
            return await async_aiohttp_proxy_stream(
                self.hass, request, response.content, response.headers["Content-Type"]
            )
