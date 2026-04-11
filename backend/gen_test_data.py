"""
Generate 3 months of realistic baby event data for testing/demo purposes.

Creates a clean database with two parent accounts and one baby, then
populates 91 days of events. Re-running wipes and regenerates everything.

Usage:
    poetry run python gen_test_data.py
"""
import asyncio
import os
import random
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import delete
from sqlalchemy.dialects.sqlite import insert

from app.db.database import Base
from app.models import *  # noqa
from app.models.event import Event
from app.models.user import User
from app.models.baby import Baby
from app.models.user_baby import UserBaby
from app.auth import hash_password

DATABASE_URL = "sqlite+aiosqlite:///./babytracker.db"

# ── fixed test identities ─────────────────────────────────────────────────────

PARENT_1_ID   = "0c175cd7-07e8-462b-88a2-aa19c3f31357"
PARENT_1_EMAIL = "roald@mail.com"
PARENT_1_NAME  = "Roald"

PARENT_2_ID   = "29a1cc52-bf25-4f63-8bd5-a9c43d769756"
PARENT_2_EMAIL = "isabelle@mail.com"
PARENT_2_NAME  = "Isabelle"

PASSWORD      = "testpassword"

BABY_ID   = "7d409670-4644-4dc9-af8e-0dffdd9033cb"
BABY_NAME = "Baby"
DAYS      = 91  # how many days of events to generate

# Baby's date of birth = DAYS ago from today
BABY_DOB  = (date.today() - timedelta(days=DAYS - 1))


# ── event generation helpers ──────────────────────────────────────────────────

def rng(lo: float, hi: float) -> float:
    return random.uniform(lo, hi)


def feed_interval_min(age_days: int) -> float:
    if age_days < 14:  return rng(100, 140)
    if age_days < 42:  return rng(130, 170)
    if age_days < 70:  return rng(150, 210)
    return rng(180, 240)


def sleep_session_dur_min(age_days: int, is_night: bool) -> float:
    if is_night:
        if age_days < 21:  return rng(90, 180)
        if age_days < 56:  return rng(150, 270)
        return rng(210, 360)
    else:
        if age_days < 21:  return rng(30, 90)
        if age_days < 56:  return rng(45, 120)
        return rng(60, 150)


def num_day_naps(age_days: int) -> int:
    if age_days < 21:  return random.randint(4, 6)
    if age_days < 56:  return random.randint(3, 5)
    return random.randint(3, 4)


def num_diapers(age_days: int) -> int:
    if age_days < 14:  return random.randint(8, 12)
    if age_days < 42:  return random.randint(6, 10)
    return random.randint(5, 8)


def who_logged() -> str:
    return PARENT_1_ID if random.random() < 0.6 else PARENT_2_ID


def make_event(etype: str, ts: datetime, metadata=None) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "type": etype,
        "timestamp": ts.replace(tzinfo=timezone.utc),
        "logged_by": who_logged(),
        "baby_id": BABY_ID,
        "metadata_": metadata,
    }


def generate_day(date: datetime, age_days: int) -> list[dict]:
    events: list[dict] = []
    day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── night sleep: sessions ending in the morning of this day ──────────────
    night_end_hour = rng(5.0, 7.0)
    night_end = day_start + timedelta(hours=night_end_hour + random.gauss(0, 0.2))
    num_night_sessions = 1 if age_days > 42 else random.randint(1, 2)
    cursor = night_end
    for _ in range(num_night_sessions):
        dur = sleep_session_dur_min(age_days, is_night=True)
        session_end = cursor
        session_start = cursor - timedelta(minutes=dur)
        night_boundary = day_start - timedelta(hours=3)  # 21:00 previous day
        if session_start >= night_boundary:
            events.append(make_event("sleep_start", session_start))
            events.append(make_event("sleep_end", session_end))
        cursor = session_start - timedelta(minutes=rng(20, 60))

    # ── day naps: 07:00–21:00 ─────────────────────────────────────────────────
    nap_cursor = day_start + timedelta(hours=night_end_hour + rng(0.5, 1.5))
    for _ in range(num_day_naps(age_days)):
        nap_start = nap_cursor + timedelta(minutes=rng(45, 120))
        if nap_start.hour >= 19 and nap_start.minute >= 30:
            break
        dur = sleep_session_dur_min(age_days, is_night=False)
        nap_end = nap_start + timedelta(minutes=dur)
        events.append(make_event("sleep_start", nap_start))
        events.append(make_event("sleep_end", nap_end))
        nap_cursor = nap_end

    # ── feeds ─────────────────────────────────────────────────────────────────
    interval = feed_interval_min(age_days)
    feed_cursor = day_start + timedelta(hours=night_end_hour + rng(0.0, 0.5))
    while feed_cursor < day_start + timedelta(hours=23):
        feed_time = feed_cursor + timedelta(minutes=random.gauss(0, interval * 0.12))
        if day_start <= feed_time < day_start + timedelta(hours=24):
            if random.random() < 0.5:
                meta = {"feed_type": "bottle", "amount_ml": round(rng(60, 150) / 5) * 5}
            else:
                meta = {
                    "feed_type": "breast",
                    "left_duration_min":  random.randint(5, 20) if random.random() > 0.3 else None,
                    "right_duration_min": random.randint(5, 20) if random.random() > 0.3 else None,
                }
            events.append(make_event("feed", feed_time, meta))
        feed_cursor += timedelta(minutes=interval + random.gauss(0, 10))

    # ── diapers ───────────────────────────────────────────────────────────────
    for _ in range(num_diapers(age_days)):
        t = day_start + timedelta(hours=rng(6, 22))
        dt = random.choices(["wet", "dirty", "both"], [0.55, 0.25, 0.20])[0]
        events.append(make_event("diaper", t, {"diaper_type": dt}))

    return events


# ── main ──────────────────────────────────────────────────────────────────────

async def main():
    # Drop the SQLite file entirely so create_all always gets a fresh schema
    db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"Dropped {db_path}")

    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    print("Clearing existing data…")
    async with session_factory() as session:
        await session.execute(delete(Event))
        await session.execute(delete(UserBaby))
        await session.execute(delete(User))
        await session.execute(delete(Baby))
        await session.commit()

    print("Creating baby and parent accounts…")
    async with session_factory() as session:
        session.add(Baby(id=BABY_ID, name=BABY_NAME, date_of_birth=BABY_DOB))
        session.add(User(
            id=PARENT_1_ID,
            email=PARENT_1_EMAIL,
            hashed_password=hash_password(PASSWORD),
            display_name=PARENT_1_NAME,
        ))
        session.add(User(
            id=PARENT_2_ID,
            email=PARENT_2_EMAIL,
            hashed_password=hash_password(PASSWORD),
            display_name=PARENT_2_NAME,
        ))
        session.add(UserBaby(user_id=PARENT_1_ID, baby_id=BABY_ID))
        session.add(UserBaby(user_id=PARENT_2_ID, baby_id=BABY_ID))
        await session.commit()

    print("Generating events…")
    random.seed(42)
    all_events: list[dict] = []
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    for day_i in range(DAYS):
        date_ = now - timedelta(days=DAYS - 1 - day_i)
        all_events.extend(generate_day(date_, age_days=day_i))

    print(f"Inserting {len(all_events)} events across {DAYS} days…")
    async with session_factory() as session:
        for e in all_events:
            await session.execute(
                insert(Event).values(**e).on_conflict_do_nothing(index_elements=["id"])
            )
        await session.commit()

    await engine.dispose()
    print(f"\nDone.")
    print(f"  Baby:      {BABY_NAME}  (DOB {BABY_DOB})")
    print(f"  Parent 1:  {PARENT_1_EMAIL}  /  {PASSWORD}  ({PARENT_1_NAME})")
    print(f"  Parent 2:  {PARENT_2_EMAIL}  /  {PASSWORD}  ({PARENT_2_NAME})")


if __name__ == "__main__":
    asyncio.run(main())
