from datetime import date, datetime, timezone, timedelta
import pytest

from app.routers.leaderboards import _compute_parent_stats, _winner_uid, compute_feed_stats
from app.utils import NIGHT_SHIFT_START, NIGHT_SHIFT_END, safe_zone


# ── Unit tests for pure helper functions ──────────────────────────────────────

class _FakeEvent:
    def __init__(self, logged_by: str, hour: int, etype: str = "feed", diaper_type: str | None = None, location: str = "diaper"):
        self.logged_by = logged_by
        self.timestamp = datetime(2024, 1, 15, hour, 0, 0, tzinfo=timezone.utc)
        self.type = etype
        self.metadata_ = {"diaper_type": diaper_type, "location": location} if diaper_type else {}


def test_compute_parent_stats_counts_total_logs():
    users = {"u1": "Parent 1", "u2": "Parent 2"}
    events = [_FakeEvent("u1", 10), _FakeEvent("u1", 12), _FakeEvent("u2", 14)]
    stats = _compute_parent_stats(events, users)
    assert stats["u1"]["total_logs"] == 2
    assert stats["u2"]["total_logs"] == 1


def test_compute_parent_stats_night_shift_boundary():
    """Events at NIGHT_SHIFT_START or later, or before NIGHT_SHIFT_END, count as night."""
    users = {"u1": "Parent 1"}
    events = [
        _FakeEvent("u1", NIGHT_SHIFT_START),      # 21:00 — night
        _FakeEvent("u1", NIGHT_SHIFT_END - 1),    # 06:00 — night
        _FakeEvent("u1", NIGHT_SHIFT_END),         # 07:00 — not night
        _FakeEvent("u1", NIGHT_SHIFT_START - 1),   # 20:00 — not night
    ]
    stats = _compute_parent_stats(events, users)
    assert stats["u1"]["night_shifts"] == 2


def test_compute_parent_stats_poop_changes():
    users = {"u1": "Parent 1"}
    events = [
        _FakeEvent("u1", 10, "output", "dirty", "diaper"),
        _FakeEvent("u1", 11, "output", "both",  "diaper"),
        _FakeEvent("u1", 12, "output", "wet",   "diaper"),  # wet doesn't count
        _FakeEvent("u1", 13, "output", "dirty", "potty"),   # potty doesn't count
        _FakeEvent("u1", 14, "feed"),                       # not an output
    ]
    stats = _compute_parent_stats(events, users)
    assert stats["u1"]["poop_changes"] == 2


def test_compute_parent_stats_unknown_user_ignored():
    users = {"u1": "Parent 1"}
    events = [_FakeEvent("u-unknown", 10)]
    stats = _compute_parent_stats(events, users)
    assert "u-unknown" not in stats


def test_winner_uid_returns_highest():
    stats = {
        "u1": {"total_logs": 5, "night_shifts": 1, "poop_changes": 0},
        "u2": {"total_logs": 3, "night_shifts": 2, "poop_changes": 0},
    }
    assert _winner_uid(stats, "total_logs") == "u1"
    assert _winner_uid(stats, "night_shifts") == "u2"


def test_winner_uid_none_when_all_zero():
    stats = {
        "u1": {"total_logs": 0, "night_shifts": 0, "poop_changes": 0},
        "u2": {"total_logs": 0, "night_shifts": 0, "poop_changes": 0},
    }
    assert _winner_uid(stats, "total_logs") is None


# ── HTTP endpoint tests ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_leaderboards_returns_204_when_events_are_recent(client_with_family):
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "recent-feed", "type": "feed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_leaderboards_returns_200_after_seven_days(client_with_family):
    client, headers = client_with_family
    old_ts = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    await client.post("/events", json={
        "id": "old-feed", "type": "feed",
        "timestamp": old_ts,
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_leaderboards_returns_parent_stats(client_with_family):
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "lb-feed", "type": "feed",
        "timestamp": "2024-01-15T10:00:00Z",
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    assert r.status_code == 200
    parents = r.json()["parents"]
    assert len(parents) == 2  # both parents in the family are listed
    names = {p["display_name"] for p in parents}
    assert "Parent 1" in names
    assert "Parent 2" in names


@pytest.mark.asyncio
async def test_leaderboards_night_shift_counted(client_with_family):
    client, headers = client_with_family
    # Log one event in daytime, one at night
    await client.post("/events", json={
        "id": "day-feed", "type": "feed",
        "timestamp": "2024-01-15T10:00:00Z",
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)
    await client.post("/events", json={
        "id": "night-feed", "type": "feed",
        "timestamp": "2024-01-15T22:00:00Z",  # 22:00 — counts as night shift
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    parents = {p["display_name"]: p for p in r.json()["parents"]}
    assert parents["Parent 1"]["total_logs"] == 2
    assert parents["Parent 1"]["night_shifts"] == 1


@pytest.mark.asyncio
async def test_leaderboards_sleep_records(client_with_family):
    """Longest sleep, best night, and worst night are computed from completed sessions."""
    client, headers = client_with_family
    # One 3-hour sleep session, entirely within the night window (21:00–07:00).
    # Use a relative date (30 days ago) so the event is always within the 730-day window.
    base = (datetime.now(timezone.utc) - timedelta(days=30)).replace(hour=22, minute=0, second=0, microsecond=0)
    end = base + timedelta(hours=3)
    await client.post("/events", json={"id": "sl-s", "type": "sleep_start", "timestamp": base.isoformat()}, headers=headers)
    await client.post("/events", json={"id": "sl-e", "type": "sleep_end",   "timestamp": end.isoformat()}, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    data = r.json()
    assert data["longest_sleep_min"] == 180.0
    assert data["longest_sleep_date"] == base.date().isoformat()
    assert data["best_night_min"] is not None
    assert data["best_night_min"] > 0


@pytest.mark.asyncio
async def test_leaderboards_most_feeds_record(client_with_family):
    client, headers = client_with_family
    # 3 feeds on one day (30 days ago, always within the 730-day window)
    base_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()
    for i in range(3):
        ts = datetime(base_date.year, base_date.month, base_date.day, 8 + i * 2, 0, 0, tzinfo=timezone.utc)
        await client.post("/events", json={
            "id": f"rec-feed-{i}", "type": "feed",
            "timestamp": ts.isoformat(),
            "metadata": {"feed_type": "bottle", "amount_ml": 100},
        }, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    data = r.json()
    assert data["most_feeds_count"] == 3
    assert data["most_feeds_date"] == base_date.isoformat()


@pytest.mark.asyncio
async def test_leaderboards_most_poop_record(client_with_family):
    client, headers = client_with_family
    # Use a relative date (30 days ago) so events are always within the 730-day window
    base_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()
    for i, dtype in enumerate(["dirty", "both", "wet"]):
        ts = datetime(base_date.year, base_date.month, base_date.day, 8 + i, 0, 0, tzinfo=timezone.utc)
        await client.post("/events", json={
            "id": f"poop-{i}", "type": "output",
            "timestamp": ts.isoformat(),
            "metadata": {"diaper_type": dtype, "location": "diaper"},
        }, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    data = r.json()
    # "dirty" and "both" count; "wet" does not
    assert data["most_poop_count"] == 2
    assert data["most_poop_date"] == base_date.isoformat()


# ── Night sleep overlap edge cases ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_leaderboards_sleep_crossing_midnight_counts_toward_night(client_with_family):
    """A sleep session from 23:00 to 02:00 overlaps the night window and is counted."""
    client, headers = client_with_family
    base = (datetime.now(timezone.utc) - timedelta(days=30)).replace(
        hour=23, minute=0, second=0, microsecond=0
    )
    end = base + timedelta(hours=3)  # 02:00 next day
    await client.post("/events", json={"id": "night-s", "type": "sleep_start", "timestamp": base.isoformat()}, headers=headers)
    await client.post("/events", json={"id": "night-e", "type": "sleep_end",   "timestamp": end.isoformat()},  headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    data = r.json()
    assert data["best_night_min"] is not None
    assert data["best_night_min"] > 0


@pytest.mark.asyncio
async def test_leaderboards_daytime_only_sleep_yields_no_best_night(client_with_family):
    """A sleep session entirely within the day window (09:00–11:00) contributes 0 to night sleep."""
    client, headers = client_with_family
    base = (datetime.now(timezone.utc) - timedelta(days=30)).replace(
        hour=9, minute=0, second=0, microsecond=0
    )
    end = base + timedelta(hours=2)
    await client.post("/events", json={"id": "day-s", "type": "sleep_start", "timestamp": base.isoformat()}, headers=headers)
    await client.post("/events", json={"id": "day-e", "type": "sleep_end",   "timestamp": end.isoformat()},  headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    data = r.json()
    # No night overlap → best_night_min should be None or 0
    assert data["best_night_min"] is None or data["best_night_min"] == 0


@pytest.mark.asyncio
async def test_leaderboards_best_and_worst_night_differ_across_sessions(client_with_family):
    """With two nights of very different sleep, best and worst night dates differ."""
    client, headers = client_with_family
    # Good night: 6 h from 21:00 (30 days ago)
    good_start = (datetime.now(timezone.utc) - timedelta(days=30)).replace(
        hour=21, minute=0, second=0, microsecond=0
    )
    await client.post("/events", json={"id": "gs", "type": "sleep_start", "timestamp": good_start.isoformat()}, headers=headers)
    await client.post("/events", json={"id": "ge", "type": "sleep_end",   "timestamp": (good_start + timedelta(hours=6)).isoformat()}, headers=headers)

    # Poor night: 1 h from 21:00 (20 days ago)
    bad_start = (datetime.now(timezone.utc) - timedelta(days=20)).replace(
        hour=21, minute=0, second=0, microsecond=0
    )
    await client.post("/events", json={"id": "bs", "type": "sleep_start", "timestamp": bad_start.isoformat()}, headers=headers)
    await client.post("/events", json={"id": "be", "type": "sleep_end",   "timestamp": (bad_start + timedelta(hours=1)).isoformat()}, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    data = r.json()
    assert data["best_night_min"] is not None
    assert data["worst_night_min"] is not None
    assert data["best_night_min"] > data["worst_night_min"]
    assert data["best_night_date"] != data["worst_night_date"]


# ── Potty streak unit tests ───────────────────────────────────────────────────

class _FakePottyEvent:
    def __init__(self, date_str: str, location: str = "potty"):
        self.type = "output"
        self.timestamp = datetime.fromisoformat(date_str + "T10:00:00+00:00")
        self.metadata_ = {"diaper_type": "dirty", "location": location}


def test_compute_feed_stats_potty_streak_consecutive():
    """Three consecutive days of potty events → streak of 3."""
    events = [
        _FakePottyEvent("2024-01-10"),
        _FakePottyEvent("2024-01-11"),
        _FakePottyEvent("2024-01-12"),
    ]
    stats = compute_feed_stats(events, safe_zone("UTC"))
    assert stats.longest_potty_streak == 3
    assert stats.longest_potty_streak_date == date(2024, 1, 12)


def test_compute_feed_stats_potty_streak_gap_resets():
    """A gap in potty days resets the streak; longest run wins."""
    events = [
        _FakePottyEvent("2024-01-10"),
        _FakePottyEvent("2024-01-11"),
        # gap on 12th
        _FakePottyEvent("2024-01-13"),
        _FakePottyEvent("2024-01-14"),
        _FakePottyEvent("2024-01-15"),
    ]
    stats = compute_feed_stats(events, safe_zone("UTC"))
    assert stats.longest_potty_streak == 3
    assert stats.longest_potty_streak_date == date(2024, 1, 15)


def test_compute_feed_stats_potty_streak_multiple_events_same_day():
    """Multiple potty events on the same day count as a single day in the streak."""
    events = [
        _FakePottyEvent("2024-01-10"),
        _FakePottyEvent("2024-01-10"),  # duplicate day
        _FakePottyEvent("2024-01-11"),
    ]
    stats = compute_feed_stats(events, safe_zone("UTC"))
    assert stats.longest_potty_streak == 2


def test_compute_feed_stats_potty_streak_diaper_location_excluded():
    """Output events with location='diaper' do not count toward the potty streak."""
    events = [
        _FakePottyEvent("2024-01-10", location="diaper"),
        _FakePottyEvent("2024-01-11", location="potty"),
    ]
    stats = compute_feed_stats(events, safe_zone("UTC"))
    assert stats.longest_potty_streak == 1


def test_compute_feed_stats_potty_streak_none_when_no_potty_events():
    events = [_FakePottyEvent("2024-01-10", location="diaper")]
    stats = compute_feed_stats(events, safe_zone("UTC"))
    assert stats.longest_potty_streak is None
    assert stats.longest_potty_streak_date is None


# ── Potty streak integration test ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_leaderboards_longest_potty_streak(client_with_family):
    """Potty events on 3 consecutive days yield a streak of 3 ending on the last day."""
    client, headers = client_with_family
    base_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()
    for i in range(3):
        ts = datetime(base_date.year, base_date.month, base_date.day + i, 10, 0, 0, tzinfo=timezone.utc)
        await client.post("/events", json={
            "id": f"potty-streak-{i}", "type": "output",
            "timestamp": ts.isoformat(),
            "metadata": {"diaper_type": "dirty", "location": "potty"},
        }, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    data = r.json()
    assert data["longest_potty_streak"] == 3
    assert data["longest_potty_streak_date"] is not None
