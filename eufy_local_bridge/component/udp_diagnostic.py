"""HomeBase entities for an on-demand local UDP link diagnostic."""
from homeassistant.const import EntityCategory

from .guard_mode import HomeBaseEntity

UDP_STATUSES = ["idle", "running", "bidirectional", "outbound_only", "inbound_only", "no_traffic", "error"]


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
