"""HomeBase entities for an on-demand local UDP link diagnostic."""
import re

from homeassistant.const import EntityCategory

from . import RTC_CONNECTION_ERRORS
from .guard_mode import HomeBaseEntity

UDP_STATUSES = ["idle", "running", "bidirectional", "outbound_only", "inbound_only", "no_traffic", "error"]
_ICE_STATES = ("new", "checking", "connected", "completed", "disconnected", "failed", "closed", "unknown")
_ICE_TIMESTAMP = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z")
_ICE_FLAGS = {"ice_connected": "iceConnected", "pair_seen": "pairSeen",
              "local_udp_announced": "localUdpAnnounced", "remote_udp_submitted": "remoteUdpSubmitted"}
_OPTIONAL_ICE_FLAGS = {"ice_checking_seen": "iceCheckingSeen", "ice_failed_seen": "iceFailedSeen",
                       "local_udp_matches_route": "localUdpMatchesRoute",
                       "remote_udp_matches_station": "remoteUdpMatchesStation"}


def ice_attempt(report):
    """Keep only public, typed observations, including those from older modules."""
    if not isinstance(report, dict) or report.get("iceState") not in _ICE_STATES:
        return None
    finished = report.get("finishedAt")
    if (not isinstance(finished, str) or not _ICE_TIMESTAMP.fullmatch(finished)
            or not all(type(report.get(key)) is bool for key in _ICE_FLAGS.values())):
        return None
    return {"finished_at": finished, "ice_state": report["iceState"],
            **{attr: report[key] for attr, key in _ICE_FLAGS.items()},
            **{attr: report[key] for attr, key in _OPTIONAL_ICE_FLAGS.items() if type(report.get(key)) is bool}}


def window_ice_attempts(rows):
    """Distinguish a measured empty list from a missing or invalid observation."""
    if not isinstance(rows, list) or len(rows) > 4:
        return None
    attempts = []
    for row in rows:
        observed = ice_attempt(row)
        if observed is None:
            return None
        reason = row.get("reason")
        if not isinstance(reason, str) or reason not in RTC_CONNECTION_ERRORS:
            return None
        attempts.append({"reason": reason, **observed})
    return attempts


def udp_report(data, serial):
    """Read the diagnostic only when it belongs to the selected station."""
    report = data.get("udpDiagnostic")
    if (isinstance(report, dict) and report.get("stationId") == serial
            and (data.get("station") or {}).get("id") == serial
            and report.get("status") in UDP_STATUSES):
        return report
    return {}


class UdpDiagnosticEntity(HomeBaseEntity):
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_has_entity_name = True

    @property
    def _report(self):
        return udp_report(self.coordinator.data or {}, self._serial)

    @property
    def available(self):
        return bool(super().available and self._report)
