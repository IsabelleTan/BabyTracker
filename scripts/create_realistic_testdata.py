"""
Create a test account and seed 4 months of realistic baby data.

Run from the backend/ directory:
    poetry run python ../scripts/create_realistic_testdata.py

Account created:
    email:    isabelle@mail.com
    password: testpassword

What it generates:
  • One user account + one baby (skips creation if account already exists)
  • 120 days of historical events with realistic developmental progression:
      - Feeding:  breast-heavy early → mix of breast/bottle (pumped 80%→25%, formula 20%→75%); interval 2h → 3.5h
      - Sleep:    many short naps + night waking → fewer longer naps + longer overnight
      - Diapers:  8-10/day newborn → 5-7/day at 4 months; wet/dirty/both mix
  • Growth spurts at ~3-4 weeks and ~3 months (more feeding, less sleep)
  • Today's events seeded up to the current time
  • All events use deterministic UUIDs — re-running is safe (idempotent)
"""

import asyncio
import hashlib
import os
import random
import sys
import time as _time
from datetime import date, datetime, timedelta, timezone

import httpx

# ── config ────────────────────────────────────────────────────────────────────

EMAIL    = "isabelle@mail.com"
PASSWORD = "testpassword"
NAME     = "Isabelle"
BASE_URL = "http://localhost:8000"
DAYS     = 120  # days of history before today

# ── timezone ──────────────────────────────────────────────────────────────────

_UTC_OFFSET_H = -(_time.timezone if not _time.daylight else _time.altzone) / 3600


def local_to_utc(d: date, hour: float, minute: float = 0.0) -> datetime:
    """Convert a local wall-clock time on date d to UTC."""
    local_midnight = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    return local_midnight + timedelta(hours=hour + minute / 60 - _UTC_OFFSET_H)


# ── helpers ───────────────────────────────────────────────────────────────────

def det_id(*parts: str) -> str:
    """Stable UUID-shaped ID from the given parts."""
    raw = "|".join(parts)
    h = hashlib.sha1(raw.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * max(0.0, min(1.0, t))


# ── user + baby creation (direct DB) ─────────────────────────────────────────

async def create_account() -> None:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
    from app.db.database import SessionLocal, engine, Base
    import app.models  # noqa: F401 — registers all models
    from app.models.user import User
    from app.models.baby import Baby
    from app.models.user_baby import UserBaby
    from app.auth import hash_password
    from sqlalchemy import select

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        existing = await session.execute(select(User).where(User.email == EMAIL))
        if existing.scalar_one_or_none():
            print(f"  Account {EMAIL} already exists — skipping creation.")
            return

        user = User(
            id=det_id("user", EMAIL),
            email=EMAIL,
            hashed_password=hash_password(PASSWORD),
            display_name=NAME,
        )
        baby = Baby(
            id=det_id("baby", EMAIL, "testbaby"),
            name="Baby",
        )
        session.add_all([user, baby])
        await session.flush()
        session.add(UserBaby(user_id=user.id, baby_id=baby.id))
        await session.commit()
        print(f"  Created: {NAME} ({EMAIL} / {PASSWORD})")
        print(f"  Created: Baby")


# ── event builders ────────────────────────────────────────────────────────────

def ev_breast(ts: datetime, left: float, right: float, tag: str) -> dict:
    return {
        "id": det_id("feed-breast", iso(ts), tag),
        "type": "feed",
        "timestamp": iso(ts),
        "metadata": {
            "feed_type": "breast",
            "left_duration_min":  round(max(1.0, left),  1),
            "right_duration_min": round(max(1.0, right), 1),
        },
    }


def ev_bottle(ts: datetime, ml: int, bottle_type: str, tag: str) -> dict:
    return {
        "id": det_id(f"feed-bottle-{bottle_type}", iso(ts), tag),
        "type": "feed",
        "timestamp": iso(ts),
        "metadata": {"feed_type": "bottle", "bottle_type": bottle_type, "amount_ml": ml},
    }


def ev_sleep_start(ts: datetime, tag: str) -> dict:
    return {"id": det_id("sleep-start", iso(ts), tag), "type": "sleep_start", "timestamp": iso(ts), "metadata": None}


def ev_sleep_end(ts: datetime, tag: str) -> dict:
    return {"id": det_id("sleep-end", iso(ts), tag), "type": "sleep_end", "timestamp": iso(ts), "metadata": None}


def ev_diaper(ts: datetime, dtype: str, tag: str) -> dict:
    return {
        "id": det_id("output", iso(ts), tag),
        "type": "output",
        "timestamp": iso(ts),
        "metadata": {"diaper_type": dtype, "location": "diaper"},
    }


# ── day generation ────────────────────────────────────────────────────────────

def build_day(day: date, day_index: int) -> list[dict]:
    """
    Generate one historical day of events.

    day_index 0 = oldest (4 months ago), DAYS-1 = yesterday.
    progress 0.0 = newborn patterns; 1.0 = 4-month-old patterns.

    Developmental arc:
      Feeding   2h interval, mostly breast → 3.5h, equal breast/bottle
      Sleep     many short naps + night waking → fewer long naps + long overnight
      Diapers   8-10/day → 5-7/day
    Growth spurts at weeks 3-4 (days ~21-27) and ~12 weeks (days ~78-84):
      more feeding, shorter sleep, extra fussiness.
    """
    events: list[dict] = []
    progress = day_index / max(DAYS - 1, 1)
    tag = f"d{day_index}"

    # Growth spurt modifier: extra feeding frequency + shorter sleep
    is_growth_spurt = (21 <= day_index <= 27) or (78 <= day_index <= 84)
    spurt = 0.15 if is_growth_spurt else 0.0

    # ── Overnight sleep (ends this morning) ──────────────────────────────────
    # Progresses from ~2h longest stretch → ~5.5h; regression dips at weeks 4 and 12
    base_night_min = lerp(110, 330, progress)
    regression = -55 if (25 <= day_index <= 30) or (80 <= day_index <= 87) else 0
    night_min = max(75, base_night_min + regression + random.gauss(0, 18))

    # Wake time drifts earlier as consolidation improves
    wake_hour = lerp(7.0, 6.5, progress) + random.gauss(0, 0.25)
    night_end   = local_to_utc(day, wake_hour)
    night_start = night_end - timedelta(minutes=night_min)

    events.append(ev_sleep_start(night_start, f"{tag}-ns"))
    events.append(ev_sleep_end(night_end,     f"{tag}-ne"))

    # ── Daytime naps ──────────────────────────────────────────────────────────
    # 4-5 short naps early → 2-3 longer naps at 4 months
    num_naps = max(2, round(lerp(4.5, 2.5, progress) + random.gauss(0, 0.4)))
    nap_wake_gap = lerp(55, 95, progress) + random.uniform(-10, 10)  # wake window before first nap
    nap_cursor = night_end + timedelta(minutes=nap_wake_gap)

    for ni in range(num_naps):
        # Stop adding naps after ~6:30pm local
        if nap_cursor > local_to_utc(day, 18.5):
            break
        nap_len = lerp(30, 65, progress) * (0.85 if is_growth_spurt else 1.0) + random.gauss(0, 12)
        nap_len = max(20, min(110, nap_len))
        nap_end = nap_cursor + timedelta(minutes=nap_len)
        events.append(ev_sleep_start(nap_cursor, f"{tag}-n{ni}s"))
        events.append(ev_sleep_end(nap_end,      f"{tag}-n{ni}e"))
        inter_nap = lerp(60, 105, progress) + random.gauss(0, 15)
        nap_cursor = nap_end + timedelta(minutes=inter_nap)

    # ── Feeds ─────────────────────────────────────────────────────────────────
    # Interval: 2h (newborn) → 3.5h (4 months), tighter during growth spurts
    feed_interval = lerp(120, 210, progress) * (1 - spurt * 0.8) + random.gauss(0, 12)
    feed_interval = max(90, feed_interval)

    # Breast probability: 90% early → 45% by month 4 (gradual transition to bottle)
    breast_prob = lerp(0.90, 0.45, progress)

    # Breast duration per side improves with efficiency over time
    base_left  = lerp(12, 8, progress)
    base_right = lerp(9,  6, progress)

    # Bottle volume increases as baby grows
    base_ml = lerp(65, 160, progress)

    # Bottle type split: early = mostly pumped breast milk (mum expressing),
    # later = more formula as expressed supply decreases
    pumped_frac = lerp(0.80, 0.25, progress)

    feed_cursor = night_end + timedelta(minutes=random.uniform(5, 25))
    day_cutoff  = local_to_utc(day, 23.5)
    feed_i = 0

    while feed_cursor < day_cutoff:
        jitter = random.gauss(0, feed_interval * 0.07)
        t = feed_cursor + timedelta(minutes=jitter)

        if random.random() < breast_prob:
            left  = base_left  + random.gauss(0, 1.5)
            right = base_right + random.gauss(0, 1.2)
            events.append(ev_breast(t, left, right, f"{tag}-f{feed_i}"))
        else:
            ml = round((base_ml + random.gauss(0, 12)) / 5) * 5
            ml = max(40, min(240, ml))
            bottle_type = "pumped" if random.random() < pumped_frac else "formula"
            events.append(ev_bottle(t, ml, bottle_type, f"{tag}-f{feed_i}"))

        feed_cursor += timedelta(minutes=feed_interval + random.gauss(0, 8))
        feed_i += 1

    # ── Diapers ───────────────────────────────────────────────────────────────
    # 8-10/day early → 5-7/day later
    num_diapers = round(lerp(9.0, 6.0, progress) + random.gauss(0, 0.8))
    num_diapers = max(4, min(12, num_diapers))

    # One early-morning diaper (night window), rest spread through waking hours
    diaper_times = sorted(
        [local_to_utc(day, random.uniform(2.0, 5.5))]  # early morning
        + [local_to_utc(day, random.uniform(6.5, 22.5)) for _ in range(num_diapers - 1)]
    )
    for ti, t in enumerate(diaper_times):
        dtype = random.choices(["wet", "dirty", "both"], weights=[0.55, 0.30, 0.15])[0]
        events.append(ev_diaper(t, dtype, f"{tag}-dia{ti}"))

    return events


# ── today (partial day up to now) ─────────────────────────────────────────────

def build_today(today: date) -> list[dict]:
    """
    Seed today's events up to the current time.
    Uses fixed (non-random) times so it's reproducible.
    Reflects a ~4-month-old baby's typical morning.
    """
    events: list[dict] = []
    now = datetime.now(tz=timezone.utc)

    def lts(h: float, m: float = 0) -> datetime:
        return local_to_utc(today, h, m)

    schedule = [
        # (local_hour, builder)
        (5.5,   lambda t: ev_sleep_end(t, "today-ne")),         # overnight ends ~5:30am
        (5.75,  lambda t: ev_breast(t, 9.0, 7.0, "today-f0")), # breast feed
        (6.25,  lambda t: ev_diaper(t, "wet", "today-d0")),
        (7.5,   lambda t: ev_sleep_start(t, "today-n0s")),      # morning nap
        (8.75,  lambda t: ev_sleep_end(t, "today-n0e")),        # 75 min nap
        (9.0,   lambda t: ev_diaper(t, "dirty", "today-d1")),
        (9.25,  lambda t: ev_bottle(t, 130, "pumped", "today-f1")),
        (10.75, lambda t: ev_sleep_start(t, "today-n1s")),      # second nap
        (11.75, lambda t: ev_sleep_end(t, "today-n1e")),
        (12.0,  lambda t: ev_diaper(t, "wet", "today-d2")),
        (12.25, lambda t: ev_breast(t, 8.0, 6.0, "today-f2")),
    ]

    # Prepend the overnight sleep start (previous evening ~10pm)
    from datetime import timedelta as td
    prev = today - timedelta(days=1)
    overnight_start = local_to_utc(prev, 22.0)
    if overnight_start < now:
        events.append(ev_sleep_start(overnight_start, "today-ns"))

    for hour, builder in schedule:
        t = lts(hour)
        if t < now:
            events.append(builder(t))

    return events


# ── posting ───────────────────────────────────────────────────────────────────

def login(client: httpx.Client) -> str:
    r = client.post(f"{BASE_URL}/auth/login", data={"username": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        print(f"Login failed: {r.status_code} {r.text}", file=sys.stderr)
        sys.exit(1)
    return r.json()["access_token"]


def post_event(client: httpx.Client, token: str, event: dict) -> None:
    r = client.post(
        f"{BASE_URL}/events",
        json=event,
        headers={"Authorization": f"Bearer {token}"},
    )
    if r.status_code not in (200, 201, 409):
        print(f"  Warning: {event['id']} → {r.status_code}: {r.text}", file=sys.stderr)


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("Setting up account...")
    asyncio.run(create_account())
    print()

    today = date.today()

    with httpx.Client(timeout=15) as client:
        print("Logging in...")
        token = login(client)
        print("  OK")
        print()

        print(f"Seeding {DAYS} days of history (random seed 42 — idempotent)...")
        random.seed(42)
        total = 0
        for i in range(DAYS):
            day = today - timedelta(days=DAYS - i)
            for e in build_day(day, i):
                post_event(client, token, e)
                total += 1
        print(f"  {total} events")

        print("Seeding today's events (up to now)...")
        today_evs = build_today(today)
        for e in today_evs:
            post_event(client, token, e)
        print(f"  {len(today_evs)} events")

    print()
    print("Done.")
    print(f"  email:    {EMAIL}")
    print(f"  password: {PASSWORD}")


if __name__ == "__main__":
    main()
