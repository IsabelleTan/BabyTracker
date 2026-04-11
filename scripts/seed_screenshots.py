"""
Seed realistic demo data for the BabyTracker user-manual screenshots.

Usage (from the repo root):
    cd backend
    poetry run python ../scripts/seed_screenshots.py \
        --user1-email mum@example.com  --user1-password <password> \
        --user2-email dad@example.com  --user2-password <password> \
        --base-url http://localhost:8000

What it creates:
  • 28 days of historical data (for the stats charts and sleep-trend signal)
  • Today's events  (for the home screen, timeline, and daily-story card)
  • An evening cluster feeding sequence (for the cluster-chip screenshot)
  • Events split across both users (for the leaderboards screenshot)

All events are idempotent — re-running the script with the same arguments
produces the same UUIDs so you won't get duplicates.
"""

import argparse
import hashlib
import sys
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

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

# ── auth ─────────────────────────────────────────────────────────────────────

def login(client: httpx.Client, base_url: str, email: str, password: str) -> str:
    r = client.post(f"{base_url}/auth/login", json={"email": email, "password": password})
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
    parser.add_argument("--user1-email",    required=True)
    parser.add_argument("--user1-password", required=True)
    parser.add_argument("--user2-email",    required=True)
    parser.add_argument("--user2-password", required=True)
    parser.add_argument("--base-url",       default="http://localhost:8000")
    args = parser.parse_args()

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
    print("  1. screenshots/home.png          — home screen (full page)")
    print("  2. screenshots/feed-sheet-breast.png — tap Feed → select Breast → fill in 12 / 8 min")
    print("  3. screenshots/timeline.png      — scroll to timeline, crop to card")
    print("  4. screenshots/timeline-swipe.png — swipe any timeline row left")
    print("  5. screenshots/cluster-chip.png  — scroll to cluster chip in timeline, crop to chip + row below")
    print("  6. screenshots/daily-story.png   — daily story card (visible after 18:00 local time)")
    print("  7. screenshots/sleep-trend.png   — crop to Today summary card showing trend signal")
    print("  8. screenshots/stats.png         — Stats tab, set range to past 28 days")
    print("  9. screenshots/leaderboards.png  — Leaderboards tab")
    print(" 10. screenshots/night-mode.png    — tap moon icon, then screenshot home screen")

if __name__ == "__main__":
    main()
