"""Save the pairing key through Home Assistant's own local Supervisor client."""
import asyncio
import re
import secrets

PROJECT = "https://github.com/theuncas/ha-eufy-t9000"


def _project_url(value):
    return isinstance(value, str) and value.lower().rstrip("/").removesuffix(".git") == PROJECT


async def async_provision_pairing_key(hass):
    """Return the installed app's ready-to-use key, or None for manual setup."""
    if "hassio" not in hass.config.components:
        return None
    # These dependencies are provided by the hassio integration only on supervised hosts.
    from aiohasupervisor import SupervisorError
    from aiohasupervisor.models import AddonsOptions
    from homeassistant.components.hassio import get_supervisor_client

    client = get_supervisor_client(hass)
    lock = hass.data.setdefault("eufy_local_bridge.provision_lock", asyncio.Lock())
    async with lock:
        try:
            candidates = [app for app in await client.addons.list()
                          if app.slug == f"{app.repository}_eufy_local_bridge" and _project_url(app.url)]
            if len(candidates) != 1:
                return None
            app = candidates[0]
            # For store installs the manifest's project URL is self-declared.
            # Check the repository's actual clone source before sending a credential.
            if app.repository != "local":
                source = await client.store.repository_info(app.repository)
                if source.slug != app.repository or not _project_url(source.source):
                    return None
            info = await client.addons.addon_info(app.slug)
            key = info.options.get("pairing_key")
            if key == "" and info.state in ("stopped", "error"):
                # Supervisor replaces the whole options dictionary.
                key = secrets.token_urlsafe(32)
                await client.addons.set_addon_options(app.slug, AddonsOptions(config={**info.options, "pairing_key": key}))
                info = await client.addons.addon_info(app.slug)
                key = info.options.get("pairing_key")
            if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", key):
                return None
            if info.state in ("stopped", "error"):
                await client.addons.start_addon(app.slug)
            elif info.state not in ("started", "startup"):
                return None
            return key
        except SupervisorError:
            # Error messages can contain option values. A retry re-reads persisted options.
            return None
