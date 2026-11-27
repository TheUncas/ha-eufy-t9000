"""Keep the last optional PoE previews in memory for one config entry."""
import asyncio
import logging

_LOGGER = logging.getLogger(__name__)


class PoeSnapshots:
    def __init__(self, read_frame):
        self.images = {}
        self._read_frame = read_frame
        self._plan = None
        self._task = None
        self._lock = asyncio.Lock()

    def update(self, state, available, serials):
        station = state.get("station") or {}
        interval = state.get("poeSnapshotIntervalSeconds")
        plan = None
        if (available and state.get("connected") and (state.get("auth") or {}).get("status") == "connected"
                and station.get("online") is True and station.get("id") and serials
                and type(interval) is int and 30 <= interval <= 3600):
            plan = (station["id"], interval, tuple(sorted(serials)))
        if plan == self._plan:
            return
        if not plan or not self._plan or self._plan[0] != plan[0]:
            self.images.clear()
        else:
            for serial in self.images.keys() - set(plan[2]):
                del self.images[serial]
        if self._task is not None:
            self._task.cancel()
        self._plan = plan
        self._task = asyncio.create_task(self._capture(plan)) if plan else None

    async def _capture(self, plan):
        _, interval, serials = plan
        while self._plan is plan:
            for serial in serials:
                try:
                    async with self._lock:
                        frame = await self._read_frame(serial)
                except Exception:
                    # A malformed response from one camera must not stop future cycles.
                    _LOGGER.warning("Impossible de lire la vignette PoE de ce cycle.")
                    frame = None
                if self._plan is not plan:
                    return
                if frame is not None:
                    self.images[serial] = frame
            await asyncio.sleep(interval)

    def close(self):
        self._plan = None
        self.images.clear()
        if self._task is not None:
            self._task.cancel()
            self._task = None
