from datetime import datetime, timezone


NIGHT_SHIFT_START = 21  # 9pm — events at or after this hour count as night shift
NIGHT_SHIFT_END = 7     # 7am — events before this hour count as night shift


def _utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


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
