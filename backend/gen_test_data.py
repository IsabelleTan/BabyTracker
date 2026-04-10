"""
Generate 3 months of realistic baby event data for testing/demo purposes.

Simulates a newborn gradually maturing: feeds spread out, sleep consolidates.
Run AFTER seed.py (users must exist).

Usage:
    poetry run python gen_test_data.py
"""
import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import delete
from sqlalchemy.dialects.sqlite import insert

from app.db.database import Base
from app.models import *  # noqa
from app.models.event import Event

DATABASE_URL = "sqlite+aiosqlite:///./babytracker.db"

PARENT_1 = "0c175cd7-07e8-462b-88a2-aa19c3f31357"
PARENT_2 = "29a1cc52-bf25-4f63-8bd5-a9c43d769756"

# How far back to generate data (one extra day so day 0 has night-sleep context)
DAYS = 91


def rng(lo: float, hi: float) -> float:
    return random.uniform(lo, hi)


def days_old(day_index: int) -> int:
    """Day index 0 = 90 days ago (oldest). Returns baby age in days."""
    return day_index


def feed_interval_min(age_days: int) -> float:
    """Average minutes between feeds — widens as baby grows."""
    if age_days < 14:
        return rng(100, 140)   # every ~2h
    if age_days < 42:
        return rng(130, 170)   # every ~2.5h
    if age_days < 70:
        return rng(150, 210)   # every ~3h
    return rng(180, 240)       # every ~3.5h


def sleep_session_dur_min(age_days: int, is_night: bool) -> float:
    """Duration of a single sleep session in minutes."""
    if is_night:
        if age_days < 21:
            return rng(90, 180)   # short night chunks early on
        if age_days < 56:
            return rng(150, 270)  # consolidating
        return rng(210, 360)      # longer stretches
    else:
        if age_days < 21:
            return rng(30, 90)
        if age_days < 56:
            return rng(45, 120)
        return rng(60, 150)


def num_day_naps(age_days: int) -> int:
    if age_days < 21:
        return random.randint(4, 6)
    if age_days < 56:
        return random.randint(3, 5)
    return random.randint(3, 4)


def num_diapers(age_days: int) -> int:
    if age_days < 14:
        return random.randint(8, 12)
    if age_days < 42:
        return random.randint(6, 10)
    return random.randint(5, 8)


def who_logged() -> str:
    return PARENT_1 if random.random() < 0.6 else PARENT_2


def make_event(etype: str, ts: datetime, metadata=None) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "type": etype,
        "timestamp": ts.replace(tzinfo=timezone.utc),
        "logged_by": who_logged(),
        "metadata_": metadata,
    }


def generate_day(date: datetime, age_days: int) -> list[dict]:
    events: list[dict] = []
    day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Night sleep: 21:00–07:00 ──────────────────────────────────────────────
    # Previous night's last sleep chunk ends around 05:00–07:00
    night_end_hour = rng(5.0, 7.0)
    night_end = day_start + timedelta(hours=night_end_hour + random.gauss(0, 0.2))

    # Backfill: one or two night sessions ending this morning
    num_night_sessions = 1 if age_days > 42 else random.randint(1, 2)
    cursor = night_end
    for _ in range(num_night_sessions):
        dur = sleep_session_dur_min(age_days, is_night=True)
        session_end = cursor
        session_start = cursor - timedelta(minutes=dur)
        # Only include sessions that started after 21:00 yesterday (don't double-insert)
        night_boundary = day_start - timedelta(hours=3)  # 21:00 previous day
        if session_start >= night_boundary:
            events.append(make_event("sleep_start", session_start))
            events.append(make_event("sleep_end", session_end))
        cursor = session_start - timedelta(minutes=rng(20, 60))  # brief wake between

    # ── Day naps: 07:00–21:00 ────────────────────────────────────────────────
    nap_cursor = day_start + timedelta(hours=night_end_hour + rng(0.5, 1.5))  # first wake window
    nap_count = num_day_naps(age_days)
    for _ in range(nap_count):
        wake_window = rng(45, 120)  # minutes awake before nap
        nap_start = nap_cursor + timedelta(minutes=wake_window)
        # Don't start a nap after 19:30
        if nap_start.hour >= 19 and nap_start.minute >= 30:
            break
        dur = sleep_session_dur_min(age_days, is_night=False)
        nap_end = nap_start + timedelta(minutes=dur)
        events.append(make_event("sleep_start", nap_start))
        events.append(make_event("sleep_end", nap_end))
        nap_cursor = nap_end

    # ── Feeds ────────────────────────────────────────────────────────────────
    interval = feed_interval_min(age_days)
    feed_cursor = day_start + timedelta(hours=night_end_hour + rng(0.0, 0.5))
    feed_types = ["bottle", "breast"]
    while feed_cursor < day_start + timedelta(hours=23):
        jitter = random.gauss(0, interval * 0.12)
        feed_time = feed_cursor + timedelta(minutes=jitter)
        if feed_time >= day_start and feed_time < day_start + timedelta(hours=24):
            ft = random.choice(feed_types)
            if ft == "bottle":
                meta = {"feed_type": "bottle", "amount_ml": round(rng(60, 150) / 5) * 5}
            else:
                meta = {
                    "feed_type": "breast",
                    "left_duration_min": random.randint(5, 20) if random.random() > 0.3 else None,
                    "right_duration_min": random.randint(5, 20) if random.random() > 0.3 else None,
                }
            events.append(make_event("feed", feed_time, meta))
        feed_cursor += timedelta(minutes=interval + random.gauss(0, 10))

    # ── Diapers ──────────────────────────────────────────────────────────────
    diaper_types = ["wet", "dirty", "both"]
    diaper_weights = [0.55, 0.25, 0.20]
    for _ in range(num_diapers(age_days)):
        hour = rng(6, 22)
        t = day_start + timedelta(hours=hour)
        dt = random.choices(diaper_types, diaper_weights)[0]
        events.append(make_event("diaper", t, {"diaper_type": dt}))

    return events


async def main():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    random.seed(42)

    all_events: list[dict] = []
    now = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    for day_i in range(DAYS):
        date = now - timedelta(days=DAYS - 1 - day_i)
        events = generate_day(date, age_days=day_i)
        all_events.extend(events)

    print(f"Generated {len(all_events)} events across {DAYS} days — clearing old test data and inserting…")

    async with session_factory() as session:
        # Clear events logged by the two test parents before regenerating
        await session.execute(
            delete(Event).where(Event.logged_by.in_([PARENT_1, PARENT_2]))
        )
        await session.commit()

        for e in all_events:
            stmt = (
                insert(Event)
                .values(**e)
                .on_conflict_do_nothing(index_elements=["id"])
            )
            await session.execute(stmt)
        await session.commit()

    await engine.dispose()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
