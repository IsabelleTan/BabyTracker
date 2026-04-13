from datetime import datetime, timedelta, timezone


NIGHT_SHIFT_START = 21  # 9pm — events at or after this hour count as night shift
NIGHT_SHIFT_END = 7     # 7am — events before this hour count as night shift

# A "parenting day" runs from 05:00 to 04:59:59 the following day.
# Events logged between midnight and 04:59 belong to the *previous* parenting day
# (they are part of the overnight stretch that started the evening before).
DAY_START_HOUR = 5


def _utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def parenting_day(ts: datetime, tz_offset_min: int = 0) -> str:
    """Return the YYYY-MM-DD parenting-day this UTC timestamp belongs to.

    tz_offset_min: client UTC offset in minutes (positive = UTC+, e.g. +120 for UTC+2).
    Converts the timestamp to local time first, then shifts back by DAY_START_HOUR so
    that events between local 00:00–04:59 are attributed to the previous parenting day.
    """
    local_ts = _utc(ts) + timedelta(minutes=tz_offset_min)
    return (local_ts - timedelta(hours=DAY_START_HOUR)).date().isoformat()


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
