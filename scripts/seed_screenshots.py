"""
Seed realistic demo data for the BabyTracker user-manual screenshots.

Usage (from the backend/ directory):

  First-time setup — creates both user accounts and seeds all data:
    poetry run python ../scripts/seed_screenshots.py --create-users

  Subsequent runs — re-seeds data without touching accounts:
    poetry run python ../scripts/seed_screenshots.py \
        --user1-email mum@example.com  --user1-password secret1 \
        --user2-email dad@example.com  --user2-password secret2

  --create-users writes directly to the database (no registration endpoint
  exists). It uses fixed credentials: mum@example.com / secret1 and
  dad@example.com / secret2. Run from the backend/ directory so the app
  config (DATABASE_URL etc.) resolves correctly.

What it creates:
  • Two user accounts sharing one baby (--create-users only)
  • 28 days of historical data (stats charts, leaderboard records)
  • Today's events up to 11:30am (home screen, timeline, summary)
  • Events split across both users (leaderboards, partner messages)

All events are idempotent — re-running produces the same UUIDs.

Timezone note: today's events are generated in local time so that
timestamps display correctly when screenshots are taken at ~11:30am.
"""

import argparse
import asyncio
import hashlib
import random
import sys
import time as _time
from datetime import date, datetime, timedelta, timezone

import httpx

# ── timezone helpers ──────────────────────────────────────────────────────────

# Local UTC offset in hours (e.g. +2 for CEST, -5 for EST)
_LOCAL_UTC_OFFSET_HOURS = -(_time.timezone if not _time.daylight else _time.altzone) / 3600


def local_to_utc(d: date, hour: int, minute: int = 0) -> datetime:
    """Convert a local wall-clock time on date d to a UTC datetime."""
    local_midnight = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    return local_midnight + timedelta(hours=hour + minute / 60 - _LOCAL_UTC_OFFSET_HOURS)


# ── helpers ──────────────────────────────────────────────────────────────────

def deterministic_id(*parts: str) -> str:
    """Stable UUID-shaped ID derived from the given parts (no randomness)."""
    raw = "|".join(parts)
    h = hashlib.sha1(raw.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def utc(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


# ── user creation (direct DB, no registration endpoint) ──────────────────────

DEFAULT_USER1_EMAIL    = "mum@example.com"
DEFAULT_USER1_PASSWORD = "secret1"
DEFAULT_USER1_NAME     = "Mum"
DEFAULT_USER2_EMAIL    = "dad@example.com"
DEFAULT_USER2_PASSWORD = "secret2"
DEFAULT_USER2_NAME     = "Dad"


async def create_users_in_db() -> None:
    """Create two users + one shared baby directly in the database."""
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../backend")
    from app.db.database import SessionLocal, engine, Base
    import app.models  # noqa: F401 — registers all models against Base
    from app.models.user import User
    from app.models.baby import Baby
    from app.models.user_baby import UserBaby
    from app.auth import hash_password
    from sqlalchemy import select

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        existing = await session.execute(select(User).where(User.email == DEFAULT_USER1_EMAIL))
        if existing.scalar_one_or_none():
            print("  Users already exist — skipping creation.")
            return

        user1 = User(
            id=deterministic_id("user", DEFAULT_USER1_EMAIL),
            email=DEFAULT_USER1_EMAIL,
            hashed_password=hash_password(DEFAULT_USER1_PASSWORD),
            display_name=DEFAULT_USER1_NAME,
        )
        user2 = User(
            id=deterministic_id("user", DEFAULT_USER2_EMAIL),
            email=DEFAULT_USER2_EMAIL,
            hashed_password=hash_password(DEFAULT_USER2_PASSWORD),
            display_name=DEFAULT_USER2_NAME,
        )
        baby = Baby(
            id=deterministic_id("baby", "screenshot-demo"),
            name="Baby",
        )
        session.add_all([user1, user2, baby])
        await session.flush()
        session.add(UserBaby(user_id=user1.id, baby_id=baby.id))
        session.add(UserBaby(user_id=user2.id, baby_id=baby.id))
        await session.commit()
        print(f"  Created: {DEFAULT_USER1_NAME} ({DEFAULT_USER1_EMAIL} / {DEFAULT_USER1_PASSWORD})")
        print(f"  Created: {DEFAULT_USER2_NAME} ({DEFAULT_USER2_EMAIL} / {DEFAULT_USER2_PASSWORD})")
        print(f"  Created: Baby (shared)")


# ── auth ─────────────────────────────────────────────────────────────────────

def login(client: httpx.Client, base_url: str, email: str, password: str) -> str:
    r = client.post(f"{base_url}/auth/login", data={"username": email, "password": password})
    if r.status_code != 200:
        print(f"  Login failed for {email}: {r.status_code} {r.text}", file=sys.stderr)
        sys.exit(1)
    return r.json()["access_token"]


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── event posting ─────────────────────────────────────────────────────────────

def post_event(client: httpx.Client, base_url: str, token: str, event: dict) -> None:
    r = client.post(f"{base_url}/events", json=event, headers=headers(token))
    if r.status_code not in (200, 201, 409):  # 409 = already exists (idempotent)
        print(f"  Warning: event {event['id']} returned {r.status_code}: {r.text}", file=sys.stderr)


# ── event builders (accept pre-computed UTC datetime) ─────────────────────────

def feed_bottle_at(ts: datetime, amount_ml: int, uid_tag: str) -> dict:
    return {
        "id": deterministic_id("feed", iso(ts), uid_tag),
        "type": "feed",
        "timestamp": iso(ts),
        "metadata": {"feed_type": "bottle", "amount_ml": amount_ml},
    }


def feed_breast_at(ts: datetime, left: int, right: int, uid_tag: str) -> dict:
    return {
        "id": deterministic_id("feed", iso(ts), uid_tag),
        "type": "feed",
        "timestamp": iso(ts),
        "metadata": {"feed_type": "breast", "left_duration_min": left, "right_duration_min": right},
    }


def sleep_start_at(ts: datetime, uid_tag: str) -> dict:
    return {
        "id": deterministic_id("sleep_start", iso(ts), uid_tag),
        "type": "sleep_start",
        "timestamp": iso(ts),
        "metadata": None,
    }


def sleep_end_at(ts: datetime, uid_tag: str) -> dict:
    return {
        "id": deterministic_id("sleep_end", iso(ts), uid_tag),
        "type": "sleep_end",
        "timestamp": iso(ts),
        "metadata": None,
    }


def diaper_at(ts: datetime, diaper_type: str, uid_tag: str) -> dict:
    return {
        "id": deterministic_id("output", iso(ts), uid_tag),
        "type": "output",
        "timestamp": iso(ts),
        "metadata": {"diaper_type": diaper_type, "location": "diaper"},
    }


# ── historical data builders (UTC, used for charts not display times) ─────────

def feed_bottle(day_str: str, hour: int, minute: int, amount_ml: int, user_tag: str) -> dict:
    ts = utc(*[int(x) for x in day_str.split("-")], hour, minute)
    return {
        "id": deterministic_id("feed", day_str, str(hour), str(minute), user_tag),
        "type": "feed",
        "timestamp": iso(ts),
        "metadata": {"feed_type": "bottle", "amount_ml": amount_ml},
    }


def sleep_start(day_str: str, hour: int, minute: int, user_tag: str) -> dict:
    ts = utc(*[int(x) for x in day_str.split("-")], hour, minute)
    return {
        "id": deterministic_id("sleep_start", day_str, str(hour), str(minute), user_tag),
        "type": "sleep_start",
        "timestamp": iso(ts),
        "metadata": None,
    }


def sleep_end(day_str: str, hour: int, minute: int, user_tag: str) -> dict:
    ts = utc(*[int(x) for x in day_str.split("-")], hour, minute)
    return {
        "id": deterministic_id("sleep_end", day_str, str(hour), str(minute), user_tag),
        "type": "sleep_end",
        "timestamp": iso(ts),
        "metadata": None,
    }


def diaper(day_str: str, hour: int, minute: int, diaper_type: str, user_tag: str) -> dict:
    ts = utc(*[int(x) for x in day_str.split("-")], hour, minute)
    return {
        "id": deterministic_id("output", day_str, str(hour), str(minute), user_tag),
        "type": "output",
        "timestamp": iso(ts),
        "metadata": {"diaper_type": diaper_type, "location": "diaper"},
    }


# ── historical data (28 days) ─────────────────────────────────────────────────
# Call random.seed(42) before the loop in main() — all variation below comes
# from Python's Mersenne Twister so curves look organic, not periodic.

def build_historical_day(day: date, day_index: int) -> tuple[list[dict], list[dict]]:
    """
    Returns (user1_events, user2_events) for one historical day.

    Uses interval-based feeds, cursor-based naps, and Gaussian timing noise
    (same technique as gen_scenario_data.py) for natural-looking chart curves.

    Award targets over 28 days:
      Night Shift Ninja → Mum (u1): owns night-hour events (UTC h<7 or h≥21)
      Chief Log Officer → Dad (u2): slightly more events per day overall
      Number One at Number Two → Dad (u2): ~63% of dirty/both diapers
    """
    u1: list[dict] = []  # Mum
    u2: list[dict] = []  # Dad

    day_base = datetime(day.year, day.month, day.day, 0, 0, tzinfo=timezone.utc)

    # ── Night sleep ───────────────────────────────────────────────────────────
    # Upward trend (150→258 min) with Gaussian noise and regression dips every
    # ~8 days to simulate growth spurts — produces a noisy but rising curve.
    trend      = 150 + day_index * 4
    regression = -50 if day_index % 8 == 7 else 0
    night_min  = max(90, trend + regression + random.gauss(0, 20))

    night_end   = day_base + timedelta(hours=random.uniform(5.0, 7.0) + random.gauss(0, 0.2))
    night_start = night_end - timedelta(minutes=night_min)

    u1.append(sleep_start_at(night_start, "u1"))  # Mum logs start — night shift
    u2.append(sleep_end_at(night_end,     "u2"))  # Dad logs end   — night shift

    # ── Daytime naps (cursor-based) ───────────────────────────────────────────
    nap_cursor  = night_end
    nap_count   = random.randint(2, 3)
    for nap_i in range(nap_count):
        nap_start = nap_cursor + timedelta(minutes=random.uniform(60, 130))
        if nap_start.hour >= 19:
            break
        nap_dur = random.uniform(35, 105)
        nap_end = nap_start + timedelta(minutes=nap_dur)
        if nap_i % 2 == 0:
            u2.append(sleep_start_at(nap_start, "u2"))  # Dad
            u1.append(sleep_end_at(nap_end,     "u1"))  # Mum
        else:
            u1.append(sleep_start_at(nap_start, "u1"))  # Mum
            u2.append(sleep_end_at(nap_end,     "u2"))  # Dad
        nap_cursor = nap_end

    # ── Feeds (interval-based with Gaussian noise) ────────────────────────────
    interval     = random.uniform(130, 185)  # ~2–3h for a newborn
    feed_cursor  = night_end + timedelta(minutes=random.uniform(0, 30))
    day_end      = day_base + timedelta(hours=24)

    while feed_cursor < day_end - timedelta(hours=1):
        t   = feed_cursor + timedelta(minutes=random.gauss(0, interval * 0.10))
        amt = round(random.uniform(65, 130) / 5) * 5
        if day_base <= t < day_end:
            is_night = t.hour >= 21 or t.hour < 7
            if is_night:
                owner = "u1" if random.random() < 0.70 else "u2"  # Mum owns most night feeds
            else:
                owner = "u2" if random.random() < 0.62 else "u1"  # Dad owns most day feeds
            (u1 if owner == "u1" else u2).append(feed_bottle_at(t, amt, owner))
        feed_cursor += timedelta(minutes=interval + random.gauss(0, 12))

    # ── Diapers ───────────────────────────────────────────────────────────────
    diaper_count = random.randint(5, 7)
    # One in the early-morning night window (Mum), rest spread through the day
    times = sorted(
        [day_base + timedelta(hours=random.uniform(2, 5))]
        + [day_base + timedelta(hours=random.uniform(7, 22)) for _ in range(diaper_count - 1)]
    )
    for t in times:
        dtype = random.choices(["wet", "dirty", "both"], weights=[0.55, 0.30, 0.15])[0]
        is_night = t.hour >= 21 or t.hour < 7
        if is_night:
            owner = "u1"  # Mum owns all night diapers → boosts her night shifts
        elif dtype in ("dirty", "both"):
            owner = "u2" if random.random() < 0.63 else "u1"  # Dad leads poop changes
        else:
            owner = "u2" if random.random() < 0.55 else "u1"
        (u1 if owner == "u1" else u2).append(diaper_at(t, dtype, owner))

    return u1, u2


# ── today's events (local time → UTC, realistic 11:30am snapshot) ────────────

def build_today_events(today: date) -> tuple[list[dict], list[dict]]:
    """
    Creates today's events in LOCAL time, converted to UTC, so that
    timestamps display correctly when screenshots are taken at ~11:30am.

    Timeline (local time):
      05:30  Dad   — sleep_end (overnight ends)
      06:00  Mum   — feed breast 12L / 8R
      06:30  Dad   — diaper wet
      07:15  Dad   — feed bottle 90ml
      07:45  Dad   — sleep_start (morning nap)
      08:00  Mum   — diaper dirty
      09:15  Mum   — sleep_end (90min nap ends)
      09:30  Mum   — feed breast 10L / 7R
      10:00  Dad   — diaper wet
      10:45  Dad   — feed bottle 100ml
      11:15  Mum   — diaper wet

    At 11:30am: 4 feeds, 1 sleep session (90min), 4 diapers.
    Last feed 45min ago, last diaper 15min ago. Baby currently awake.
    """
    def lts(hour: int, minute: int = 0) -> datetime:
        return local_to_utc(today, hour, minute)

    u1: list[dict] = []
    u2: list[dict] = []

    u2.append(sleep_end_at(lts(5, 30), "u2"))           # Dad: overnight ends
    u1.append(feed_breast_at(lts(6, 0), 12, 8, "u1"))   # Mum: breast feed
    u2.append(diaper_at(lts(6, 30), "wet", "u2"))        # Dad: wet nappy
    u2.append(feed_bottle_at(lts(7, 15), 90, "u2"))      # Dad: bottle
    u2.append(sleep_start_at(lts(7, 45), "u2"))          # Dad: nap starts
    u1.append(diaper_at(lts(8, 0), "dirty", "u1"))       # Mum: dirty nappy
    u1.append(sleep_end_at(lts(9, 15), "u1"))            # Mum: nap ends (90min)
    u1.append(feed_breast_at(lts(9, 30), 10, 7, "u1"))  # Mum: breast feed
    u2.append(diaper_at(lts(10, 0), "wet", "u2"))        # Dad: wet nappy
    u2.append(feed_bottle_at(lts(10, 45), 100, "u2"))    # Dad: bottle
    u1.append(diaper_at(lts(11, 15), "wet", "u1"))       # Mum: wet nappy

    return u1, u2


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo data for BabyTracker screenshots")
    parser.add_argument("--create-users", action="store_true",
                        help="Create demo user accounts directly in the DB (run once, from backend/ dir)")
    parser.add_argument("--user1-email",    default=DEFAULT_USER1_EMAIL)
    parser.add_argument("--user1-password", default=DEFAULT_USER1_PASSWORD)
    parser.add_argument("--user2-email",    default=DEFAULT_USER2_EMAIL)
    parser.add_argument("--user2-password", default=DEFAULT_USER2_PASSWORD)
    parser.add_argument("--base-url",       default="http://localhost:8000")
    args = parser.parse_args()

    if args.create_users:
        print("Creating demo users in database...")
        asyncio.run(create_users_in_db())
        print("  OK")

    today = date.today()

    with httpx.Client(timeout=10) as client:
        print("Logging in...")
        token1 = login(client, args.base_url, args.user1_email, args.user1_password)
        token2 = login(client, args.base_url, args.user2_email, args.user2_password)
        print("  OK")

        # ── 28 days of historical data ────────────────────────────────────────
        print("Seeding 28 days of historical data...")
        random.seed(42)  # fixed seed → same data every run
        for i in range(28):
            day = today - timedelta(days=28 - i)
            u1_events, u2_events = build_historical_day(day, i)
            for e in u1_events:
                post_event(client, args.base_url, token1, e)
            for e in u2_events:
                post_event(client, args.base_url, token2, e)
        print("  OK")

        # ── today (up to 11:30am local) ───────────────────────────────────────
        print(f"Seeding today's events (local UTC offset: {_LOCAL_UTC_OFFSET_HOURS:+.1f}h)...")
        u1_today, u2_today = build_today_events(today)
        for e in u1_today:
            post_event(client, args.base_url, token1, e)
        for e in u2_today:
            post_event(client, args.base_url, token2, e)
        print("  OK")

    print()
    print("Done. Suggested screenshot order:")
    print("  1. screenshots/home.png              — full home screen (~11:30am)")
    print("  2. screenshots/summary.png           — crop to Today's summary card")
    print("  3. screenshots/timeline.png          — crop to timeline card (mixed names)")
    print("  4. screenshots/timeline-swipe.png    — swipe any row left to show delete button")
    print("  5. screenshots/stats.png             — Stats tab, select '30 days'")
    print("  6. screenshots/leaderboards.png      — Leaderboards tab (Awards and Records)")
    print("  7. screenshots/night-mode.png        — tap moon icon, then screenshot")
    print("  --- no seed data needed ---")
    print("  8. screenshots/feed-sheet-breast.png — Feed sheet, Breast selected, 12/8 min filled in")
    print("  9. screenshots/time-picker.png       — any logging sheet, wheel picker visible")
    print(" 10. screenshots/milestone.png         — see manual for DevTools trigger instructions")


if __name__ == "__main__":
    main()
