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
    realistic      — 4 months of realistic newborn-to-infant data for UI development
"""
import asyncio
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.auth import hash_password
from app.db.database import Base
from app.models import *  # noqa
from app.models.baby import Baby
from app.models.event import Event
from app.models.user import User
from app.models.user_baby import UserBaby

DATABASE_URL = "sqlite+aiosqlite:///./babytracker.db"
P1       = "0c175cd7-07e8-462b-88a2-aa19c3f31357"
P1_EMAIL = "roald@mail.com"
P1_NAME  = "Roald"
P2       = "29a1cc52-bf25-4f63-8bd5-a9c43d769756"
P2_EMAIL = "isabelle@mail.com"
P2_NAME  = "Isabelle"
PASSWORD = "testpassword"
BABY_ID  = "7d409670-4644-4dc9-af8e-0dffdd9033cb"
BABY_NAME = "Baby"

_today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def _t(days_ago: int = 0, hour: int = 12, minute: int = 0) -> datetime:
    return (_today - timedelta(days=days_ago)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )


def _ev(etype: str, ts: datetime, who: str = P1, meta: dict | None = None) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "baby_id": BABY_ID,
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


# ── Realistic scenario ───────────────────────────────────────────────────────

def scenario_realistic() -> list[dict]:
    """4 months (~120 days) of realistic newborn-to-infant data.

    Patterns evolve with baby's age:
      0–2 weeks  : ~11 feeds/day, ~10 diapers/day, short sleep chunks
      2–6 weeks  : ~9 feeds/day,  ~8 diapers/day
      6–10 weeks : ~8 feeds/day,  ~7 diapers/day, settling night stretch
      10–17 weeks: ~7 feeds/day,  ~6 diapers/day, longer night stretch

    Events stop at the current UTC timestamp (no future events).
    """
    TOTAL_DAYS = 120
    now_utc = datetime.now(timezone.utc)
    random.seed(42)

    def _rng(lo: float, hi: float) -> float:
        return random.uniform(lo, hi)

    def feed_interval_min(age_days: int) -> float:
        if age_days < 14: return _rng(100, 140)
        if age_days < 42: return _rng(130, 170)
        if age_days < 70: return _rng(150, 210)
        return _rng(180, 240)

    def sleep_dur_min(age_days: int, is_night: bool) -> float:
        if is_night:
            if age_days < 21: return _rng(90, 180)
            if age_days < 56: return _rng(150, 270)
            return _rng(210, 360)
        else:
            if age_days < 21: return _rng(30, 90)
            if age_days < 56: return _rng(45, 120)
            return _rng(60, 150)

    def num_naps(age_days: int) -> int:
        if age_days < 21: return random.randint(4, 6)
        if age_days < 56: return random.randint(3, 5)
        return random.randint(3, 4)

    def num_diapers(age_days: int) -> int:
        if age_days < 14: return random.randint(8, 12)
        if age_days < 42: return random.randint(6, 10)
        return random.randint(5, 8)

    def who() -> str:
        return P1 if random.random() < 0.6 else P2

    def gen_day(day_base: datetime, age_days: int, cap: datetime) -> list[dict]:
        evts: list[dict] = []

        def add(etype: str, ts: datetime, meta=None):
            if ts <= cap:
                evts.append(_ev(etype, ts, who(), meta))

        # Night sleep ending in the morning
        night_end_h = _rng(5.0, 7.0)
        night_end = day_base + timedelta(hours=night_end_h + random.gauss(0, 0.2))
        num_night = 1 if age_days > 42 else random.randint(1, 2)
        cursor = night_end
        for _ in range(num_night):
            dur = sleep_dur_min(age_days, is_night=True)
            sess_end = cursor
            sess_start = cursor - timedelta(minutes=dur)
            if sess_start >= day_base - timedelta(hours=3):
                add("sleep_start", sess_start)
                add("sleep_end", sess_end)
            cursor = sess_start - timedelta(minutes=_rng(20, 60))

        # Day naps
        nap_cursor = day_base + timedelta(hours=night_end_h + _rng(0.5, 1.5))
        for _ in range(num_naps(age_days)):
            nap_start = nap_cursor + timedelta(minutes=_rng(45, 120))
            if nap_start.hour >= 19 and nap_start.minute >= 30:
                break
            dur = sleep_dur_min(age_days, is_night=False)
            add("sleep_start", nap_start)
            add("sleep_end", nap_start + timedelta(minutes=dur))
            nap_cursor = nap_start + timedelta(minutes=dur)

        # Feeds
        interval = feed_interval_min(age_days)
        feed_cursor = day_base + timedelta(hours=night_end_h + _rng(0.0, 0.5))
        while feed_cursor < day_base + timedelta(hours=23):
            ft = feed_cursor + timedelta(minutes=random.gauss(0, interval * 0.12))
            if day_base <= ft < day_base + timedelta(hours=24):
                if random.random() < 0.5:
                    meta = {"feed_type": "bottle", "amount_ml": round(_rng(60, 150) / 5) * 5}
                else:
                    meta = {
                        "feed_type": "breast",
                        "left_duration_min":  random.randint(5, 20) if random.random() > 0.3 else None,
                        "right_duration_min": random.randint(5, 20) if random.random() > 0.3 else None,
                    }
                add("feed", ft, meta)
            feed_cursor += timedelta(minutes=interval + random.gauss(0, 10))

        # Diapers
        for _ in range(num_diapers(age_days)):
            t = day_base + timedelta(hours=_rng(6, 22))
            dt = random.choices(["wet", "dirty", "both"], [0.55, 0.25, 0.20])[0]
            add("diaper", t, {"diaper_type": dt})

        return evts

    events: list[dict] = []
    for day_i in range(TOTAL_DAYS + 1):
        days_ago = TOTAL_DAYS - day_i
        day_base = _today - timedelta(days=days_ago)
        cap = now_utc if days_ago == 0 else day_base + timedelta(hours=24)
        events.extend(gen_day(day_base, age_days=day_i, cap=cap))

    return events


# ── Runner ────────────────────────────────────────────────────────────────────

SCENARIOS: dict[str, tuple[callable, str]] = {
    "longest_sleep": (scenario_longest_sleep, "New longest sleep record!"),
    "best_night":    (scenario_best_night,    "New best night record!"),
    "most_feeds":    (scenario_most_feeds,    "New most feeds in a day record!"),
    "most_poop":     (scenario_most_poop,     "New most poop diapers record!"),
    "night_shift":   (scenario_night_shift,   "Night Shift Ninja title changed hands!"),
    "chief_log":     (scenario_chief_log,     "Chief Log Officer title changed hands!"),
    "poop_champ":    (scenario_poop_champ,    "Number One at Number Two title changed hands!"),
    "realistic":     (scenario_realistic,     "4 months of realistic data loaded."),
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
        if name == "realistic":
            # Upsert users, baby and family link so the script works on a fresh DB
            dob = date.today() - timedelta(days=120)
            await session.execute(
                insert(Baby).values(id=BABY_ID, name=BABY_NAME, date_of_birth=dob)
                .on_conflict_do_nothing(index_elements=["id"])
            )
            for uid, email, display_name in [
                (P1, P1_EMAIL, P1_NAME),
                (P2, P2_EMAIL, P2_NAME),
            ]:
                await session.execute(
                    insert(User).values(
                        id=uid, email=email, display_name=display_name,
                        hashed_password=hash_password(PASSWORD),
                    ).on_conflict_do_nothing(index_elements=["id"])
                )
                await session.execute(
                    insert(UserBaby).values(user_id=uid, baby_id=BABY_ID)
                    .on_conflict_do_nothing()
                )
            await session.commit()

        await session.execute(delete(Event).where(Event.logged_by.in_([P1, P2])))
        await session.commit()
        for e in events:
            await session.execute(
                insert(Event).values(**e).on_conflict_do_nothing(index_elements=["id"])
            )
        await session.commit()

    await engine.dispose()
    print(f"[{name}] Inserted {len(events)} events.")
    if name == "realistic":
        print(f"  Parent 1: {P1_EMAIL} / {PASSWORD} ({P1_NAME})")
        print(f"  Parent 2: {P2_EMAIL} / {PASSWORD} ({P2_NAME})")
    else:
        print(f"Expected notification: \"{expected_msg}\"")
    print("Reload the app and check the Home (Today) and Leaderboards screens.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
