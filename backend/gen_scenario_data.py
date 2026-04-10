"""
Scenario test data for leaderboard notifications.

Each scenario clears all events for the two test parents and inserts the
minimum data needed to trigger exactly one notification. A single baseline
event is placed 8 days ago so has_enough_data=True (requires earliest event
>= 7 days old).

Usage (run from the backend/ directory):
    poetry run python gen_scenario_data.py <scenario>

Scenarios:
    longest_sleep  — "New longest sleep record!"          (3h history → 5h today)
    best_night     — "New best night record!"              (3h history → 7h tonight)
    most_feeds     — "New most feeds in a day record!"     (7 history → 8 today)
    most_poop      — "New most poop diapers record!"       (2 history → 3 today)
    night_shift    — "Night Shift Ninja title changed!"    (P1 leads → P2 overtakes today)
    chief_log      — "Chief Log Officer title changed!"    (P1 leads → P2 overtakes today)
    poop_champ     — "Number One at Number Two changed!"   (P1 leads → P2 overtakes today)
"""
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.dialects.sqlite import insert

from app.db.database import Base
from app.models import *  # noqa
from app.models.event import Event

DATABASE_URL = "sqlite+aiosqlite:///./babytracker.db"
P1 = "0c175cd7-07e8-462b-88a2-aa19c3f31357"
P2 = "29a1cc52-bf25-4f63-8bd5-a9c43d769756"

_today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def _t(days_ago: int = 0, hour: int = 12, minute: int = 0) -> datetime:
    return (_today - timedelta(days=days_ago)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )


def _ev(etype: str, ts: datetime, who: str = P1, meta: dict | None = None) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "type": etype,
        "timestamp": ts,
        "logged_by": who,
        "metadata_": meta,
    }


# ── Record scenarios ──────────────────────────────────────────────────────────

def scenario_longest_sleep() -> list[dict]:
    """History: one 3h session (8 days ago). Today: one 5h session → new record."""
    return [
        _ev("sleep_start", _t(8, 10)),
        _ev("sleep_end",   _t(8, 13)),   # 3h — previous record
        # Today: 5h session
        _ev("sleep_start", _t(0, 1)),
        _ev("sleep_end",   _t(0, 6)),    # 5h — new record
    ]


def scenario_best_night() -> list[dict]:
    """History: 3h night session (22:00–01:00, 8 days ago). Tonight: 7h (21:00–04:00) → new record.

    Night window = 21:00 to 07:00. The sleep_end timestamp is set to tomorrow
    04:00 (a future time), which is fine — the backend only cares about dates.
    """
    return [
        _ev("sleep_start", _t(8, 22)),
        _ev("sleep_end",   _t(7, 1)),    # 3h night session keyed to 8 days ago
        # Tonight: 7h session starting at 21:00 today → keyed to today
        _ev("sleep_start", _t(0, 21)),
        _ev("sleep_end",   _today + timedelta(days=1, hours=4)),  # tomorrow 04:00
    ]


def scenario_most_feeds() -> list[dict]:
    """History: 7 feeds (8 days ago). Today: 8 feeds → new record."""
    history = [_ev("feed", _t(8, h)) for h in [7, 9, 11, 13, 15, 17, 19]]
    today   = [_ev("feed", _t(0, h)) for h in [7, 9, 11, 13, 15, 17, 19, 21]]
    return history + today


def scenario_most_poop() -> list[dict]:
    """History: 2 poop diapers (8 days ago). Today: 3 poop diapers → new record."""
    history = [
        _ev("diaper", _t(8, 10), meta={"diaper_type": "dirty"}),
        _ev("diaper", _t(8, 16), meta={"diaper_type": "dirty"}),
    ]
    today = [
        _ev("diaper", _t(0, 9),  meta={"diaper_type": "dirty"}),
        _ev("diaper", _t(0, 13), meta={"diaper_type": "dirty"}),
        _ev("diaper", _t(0, 17), meta={"diaper_type": "dirty"}),
    ]
    return history + today


# ── Award scenarios ───────────────────────────────────────────────────────────
# Award claimed = winner changed between (events before today) and (all events).
# Each scenario: P1 leads before today, P2 overtakes with today's events.

def scenario_night_shift() -> list[dict]:
    """Night hours = 21:00–06:59.

    History: P1 logs sleep_start(22h) + sleep_end(01h) = 2 night events → P1: 2, P2: 0.
    Today:   P2 logs 3 events in night hours → P2: 3 > P1: 2. Title claimed.
    """
    history = [
        _ev("sleep_start", _t(8, 22), P1),  # night ✓
        _ev("sleep_end",   _t(7, 1),  P1),  # night ✓
    ]
    today = [
        _ev("feed", _t(0, 22), P2),  # night ✓
        _ev("feed", _t(0, 2),  P2),  # night ✓
        _ev("feed", _t(0, 4),  P2),  # night ✓
    ]
    return history + today


def scenario_chief_log() -> list[dict]:
    """Total events logged.

    History: P1 logs 3 events, P2 logs 2 events → P1: 3, P2: 2.
    Today:   P2 logs 2 events → P2: 4 > P1: 3. Title claimed.
    """
    history = [
        _ev("feed",   _t(8, 8),  P1),
        _ev("feed",   _t(8, 12), P1),
        _ev("diaper", _t(8, 10), P1),
        _ev("feed",   _t(8, 14), P2),
        _ev("diaper", _t(8, 16), P2),
    ]
    today = [
        _ev("feed", _t(0, 9),  P2),
        _ev("feed", _t(0, 14), P2),
    ]
    return history + today


def scenario_poop_champ() -> list[dict]:
    """Poop diaper changes.

    History: P1 changes 1 poop diaper, P2 changes 0 → P1: 1, P2: 0.
    Today:   P2 changes 2 poop diapers → P2: 2 > P1: 1. Title claimed.
    """
    history = [
        _ev("diaper", _t(8, 10), P1, {"diaper_type": "dirty"}),
    ]
    today = [
        _ev("diaper", _t(0, 9),  P2, {"diaper_type": "dirty"}),
        _ev("diaper", _t(0, 14), P2, {"diaper_type": "dirty"}),
    ]
    return history + today


# ── Runner ────────────────────────────────────────────────────────────────────

SCENARIOS: dict[str, tuple[callable, str]] = {
    "longest_sleep": (scenario_longest_sleep, "New longest sleep record!"),
    "best_night":    (scenario_best_night,    "New best night record!"),
    "most_feeds":    (scenario_most_feeds,    "New most feeds in a day record!"),
    "most_poop":     (scenario_most_poop,     "New most poop diapers record!"),
    "night_shift":   (scenario_night_shift,   "Night Shift Ninja title changed hands!"),
    "chief_log":     (scenario_chief_log,     "Chief Log Officer title changed hands!"),
    "poop_champ":    (scenario_poop_champ,    "Number One at Number Two title changed hands!"),
}


async def main(name: str) -> None:
    entry = SCENARIOS.get(name)
    if entry is None:
        print(f"Unknown scenario '{name}'.\nAvailable: {', '.join(SCENARIOS)}")
        sys.exit(1)

    build_fn, expected_msg = entry
    events = build_fn()

    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        await session.execute(delete(Event).where(Event.logged_by.in_([P1, P2])))
        await session.commit()
        for e in events:
            await session.execute(
                insert(Event).values(**e).on_conflict_do_nothing(index_elements=["id"])
            )
        await session.commit()

    await engine.dispose()
    print(f"[{name}] Inserted {len(events)} events.")
    print(f"Expected notification: \"{expected_msg}\"")
    print("Reload the app and check the Home (Today) and Leaderboards screens.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
