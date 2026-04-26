from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


NIGHT_SHIFT_START = 21  # 9pm — events at or after this hour count as night shift
NIGHT_SHIFT_END = 7     # 7am — events before this hour count as night shift

# A "parenting day" runs from 05:00 to 04:59:59 the following day.
# Events logged between midnight and 04:59 belong to the *previous* parenting day
# (they are part of the overnight stretch that started the evening before).
DAY_START_HOUR = 5

UTC = "UTC"


def _utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def safe_zone(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        return ZoneInfo(UTC)


def parenting_day(ts: datetime, zone: ZoneInfo) -> date:
    """Return the parenting-day date this UTC timestamp belongs to."""
    local_ts = _utc(ts).astimezone(zone)
    return (local_ts - timedelta(hours=DAY_START_HOUR)).date()


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
