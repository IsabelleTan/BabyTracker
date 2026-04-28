from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


NIGHT_SHIFT_START = 21  # 9pm — events at or after this hour count as night shift
NIGHT_SHIFT_END = 7     # 7am — events before this hour count as night shift

def _utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def safe_zone(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def local_date(ts: datetime, zone: ZoneInfo) -> date:
    """Return the calendar date this UTC timestamp belongs to."""
    return _utc(ts).astimezone(zone).date()


def output_wet(meta: dict) -> bool:
    return meta.get("diaper_type", "") in ("wet", "both")


def output_dirty(meta: dict) -> bool:
    return meta.get("diaper_type", "") in ("dirty", "both")


def output_at_potty(meta: dict) -> bool:
    return meta.get("location", "diaper") == "potty"


def output_at_diaper(meta: dict) -> bool:
    return meta.get("location", "diaper") == "diaper"


def pair_sleep_sessions(
    sleep_events: list[tuple[str, datetime]],
) -> list[tuple[datetime, datetime]]:
    """Pair sleep_start/sleep_end events into (start, end) tuples."""
    sessions: list[tuple[datetime, datetime]] = []
    open_start: datetime | None = None
    for etype, ts in sleep_events:
        if etype == "sleep_start":
            open_start = ts
        elif etype == "sleep_end" and open_start is not None:
            sessions.append((open_start, ts))
            open_start = None
    return sessions
