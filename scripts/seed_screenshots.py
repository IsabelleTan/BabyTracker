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
  • Today's events (home screen, timeline, summary)
  • Events split across both users (leaderboards, partner messages)

All events are idempotent — re-running produces the same UUIDs.
"""

import argparse
import asyncio
import hashlib
import sys
from datetime import date, datetime, timedelta, timezone

import httpx

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
    # Import here so the script still works without the app on PATH
    # when --create-users is not used.
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
        # Skip if users already exist
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

# ── data builders ─────────────────────────────────────────────────────────────

def feed_bottle(day_str: str, hour: int, minute: int, amount_ml: int, user_tag: str) -> dict:
    ts = utc(*[int(x) for x in day_str.split("-")], hour, minute)
    return {
        "id": deterministic_id("feed", day_str, str(hour), str(minute), user_tag),
        "type": "feed",
        "timestamp": iso(ts),
        "metadata": {"feed_type": "bottle", "amount_ml": amount_ml},
    }

def feed_breast(day_str: str, hour: int, minute: int, left: int, right: int, user_tag: str) -> dict:
    ts = utc(*[int(x) for x in day_str.split("-")], hour, minute)
    return {
        "id": deterministic_id("feed", day_str, str(hour), str(minute), user_tag),
        "type": "feed",
        "timestamp": iso(ts),
        "metadata": {"feed_type": "breast", "left_duration_min": left, "right_duration_min": right},
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
        "id": deterministic_id("diaper", day_str, str(hour), str(minute), user_tag),
        "type": "diaper",
        "timestamp": iso(ts),
        "metadata": {"diaper_type": diaper_type},
    }

# ── historical data (28 days) ─────────────────────────────────────────────────

def build_historical_day(day_str: str, day_index: int) -> tuple[list[dict], list[dict]]:
    """
    Returns (user1_events, user2_events) for a historical day.

    Sleep trend: longest stretch grows from ~2.5h (day 0) to ~4.5h (day 27)
    so the sleep-trend signal fires in the stats view.
    Feed count: 9–11 per day with natural variation.
    """
    # Longest night stretch grows linearly: 150 min → 270 min over 28 days
    longest_night_min = 150 + (day_index * 4)  # +4 min per day

    u1: list[dict] = []
    u2: list[dict] = []

    # Night stretch: starts at 22:00, ends after longest_night_min
    night_end_h = 22 + longest_night_min // 60
    night_end_m = longest_night_min % 60
    u1.append(sleep_start(day_str, 22, 0, "u1"))
    # If night sleep ends the same day (unlikely here since it will roll into next day,
    # we just log the end on the same day string for simplicity)
    end_hour = (22 * 60 + longest_night_min) // 60 % 24
    end_min   = longest_night_min % 60
    u2.append(sleep_end(day_str, end_hour, end_min, "u2"))

    # Daytime naps
    u1.append(sleep_start(day_str, 9, 30, "u1"))
    u2.append(sleep_end(day_str, 10, 45, "u2"))  # 75 min nap
    u1.append(sleep_start(day_str, 13, 0, "u1"))
    u2.append(sleep_end(day_str, 14, 15, "u2"))  # 75 min nap

    # Feeds: alternate between users; vary count 9–11
    feed_count = 9 + (day_index % 3)
    feed_hours = [1, 4, 7, 9, 11, 13, 16, 18, 21][:feed_count]
    amounts    = [90, 80, 100, 85, 95, 90, 100, 85, 90, 95, 80]
    for i, h in enumerate(feed_hours):
        events = u1 if i % 2 == 0 else u2
        events.append(feed_bottle(day_str, h, 0, amounts[i % len(amounts)], "u1" if i % 2 == 0 else "u2"))

    # Diapers: 5–6 per day, alternating users
    diaper_hours = [2, 6, 10, 14, 18, 22]
    types = ["wet", "wet", "dirty", "wet", "wet", "dirty"]
    for i, (h, t) in enumerate(zip(diaper_hours, types)):
        events = u1 if i % 2 == 0 else u2
        events.append(diaper(day_str, h, 30, t, "u1" if i % 2 == 0 else "u2"))

    return u1, u2

# ── today's events ────────────────────────────────────────────────────────────

def build_today_events(today: str) -> tuple[list[dict], list[dict]]:
    """
    Creates today's events for the home/timeline/daily-story screenshots.

    User 1 (Mum): 5 events   User 2 (Dad): 4 events + cluster feeds
    Timeline shows a mix of types and two display names.
    Cluster feeds at 19:00, 19:45, 20:30 trigger the cluster chip.
    """
    u1: list[dict] = []
    u2: list[dict] = []

    # Overnight sleep (started yesterday, ended this morning)
    u2.append(sleep_end(today, 5, 45, "u2"))          # Dad logged wake-up

    # Morning feeds & diapers
    u1.append(feed_breast(today, 6, 0, 12, 8, "u1"))  # Mum: breast feed
    u2.append(diaper(today, 6, 30, "dirty", "u2"))    # Dad: dirty nappy
    u2.append(feed_bottle(today, 8, 30, 90, "u2"))    # Dad: bottle
    u1.append(diaper(today, 9, 0, "wet", "u1"))       # Mum: wet nappy

    # Nap
    u1.append(sleep_start(today, 9, 30, "u1"))        # Mum logged sleep
    u2.append(sleep_end(today, 10, 50, "u2"))         # Dad logged wake

    # Midday
    u1.append(feed_breast(today, 11, 0, 10, 10, "u1"))
    u2.append(diaper(today, 11, 30, "wet", "u2"))
    u1.append(feed_bottle(today, 13, 15, 85, "u1"))

    # Afternoon nap
    u2.append(sleep_start(today, 13, 45, "u2"))
    u1.append(sleep_end(today, 15, 0, "u1"))          # 75 min nap

    # Afternoon feeds
    u2.append(feed_bottle(today, 15, 30, 100, "u2"))
    u1.append(diaper(today, 16, 0, "dirty", "u1"))
    u1.append(feed_breast(today, 17, 30, 8, 9, "u1"))
    u2.append(diaper(today, 18, 0, "wet", "u2"))

    # Evening cluster feeds — triggers the cluster chip (19:00, 19:45, 20:30)
    u1.append(feed_breast(today, 19, 0, 7, 5, "u1"))
    u2.append(feed_bottle(today, 19, 45, 60, "u2"))
    u1.append(feed_breast(today, 20, 30, 8, 0, "u1"))

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
        for i in range(28):
            day = today - timedelta(days=28 - i)
            day_str = day.isoformat()
            u1_events, u2_events = build_historical_day(day_str, i)
            for e in u1_events:
                post_event(client, args.base_url, token1, e)
            for e in u2_events:
                post_event(client, args.base_url, token2, e)
        print("  OK")

        # ── today ─────────────────────────────────────────────────────────────
        print("Seeding today's events...")
        today_str = today.isoformat()
        u1_today, u2_today = build_today_events(today_str)
        for e in u1_today:
            post_event(client, args.base_url, token1, e)
        for e in u2_today:
            post_event(client, args.base_url, token2, e)
        print("  OK")

    print()
    print("Done. Suggested screenshot order:")
    print("  1. screenshots/home.png             — full home screen")
    print("  2. screenshots/summary.png          — crop to Today's summary card")
    print("  3. screenshots/timeline.png         — crop to timeline card (5–6 events, two names)")
    print("  4. screenshots/timeline-swipe.png   — swipe any row left to show delete button")
    print("  5. screenshots/stats.png            — Stats tab, select '30 days'")
    print("  6. screenshots/leaderboards.png     — Leaderboards tab (both Awards and Records visible)")
    print("  7. screenshots/night-mode.png       — tap moon icon, then screenshot")
    print("  --- no seed data needed ---")
    print("  8. screenshots/feed-sheet-breast.png — Feed sheet, Breast selected, 12/8 min filled in")
    print("  9. screenshots/time-picker.png      — any logging sheet, wheel picker visible")
    print(" 10. screenshots/milestone.png        — see manual for DevTools trigger instructions")

if __name__ == "__main__":
    main()
