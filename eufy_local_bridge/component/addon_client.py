"""Pinned connection to the T9000 app on the same Home Assistant host."""
import re

from aiohttp import ClientError, ClientTimeout, Fingerprint, ServerFingerprintMismatch
from homeassistant.helpers.aiohttp_client import async_get_clientsession

ORIGIN = "https://127.0.0.1:18787"


class PairingError(Exception):
    """A safe error key for the configuration form."""


def normalize_pairing(data):
    token = data.get("token", "")
    fingerprint = data.get("fingerprint", "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token):
        raise PairingError("invalid_token")
    if not re.fullmatch(r"(?i)(?:[0-9a-f]{64}|(?:[0-9a-f]{2}:){31}[0-9a-f]{2})", fingerprint):
        raise PairingError("invalid_fingerprint")
    return {"token": token, "fingerprint": fingerprint.replace(":", "").lower()}


async def account_request(hass, pairing, path, data=None):
    session = async_get_clientsession(hass)
    pin = Fingerprint(bytes.fromhex(pairing["fingerprint"]))
    try:
        async with session.request(
            "GET" if data is None else "POST", ORIGIN + "/api/eufy/" + path,
            headers={"Authorization": "Bearer " + pairing["token"]},
            ssl=pin, allow_redirects=False, json=data, timeout=ClientTimeout(total=35),
        ) as response:
            if response.status in (401, 403):
                raise PairingError("invalid_token")
            if data is None and response.status == 200:
                status = await response.json()
                if isinstance(status, dict) and isinstance(status.get("status"), str):
                    return status
            if data is not None and response.status == 202:
                return None
            if response.status in (400, 409):
                raise PairingError("eufy_refused")
            raise PairingError("cannot_connect")
    except ServerFingerprintMismatch:
        raise PairingError("invalid_fingerprint") from None
    except (ClientError, ValueError, TimeoutError):
        raise PairingError("cannot_connect") from None
