from datetime import datetime, timezone, timedelta
import pytest

from app.routers.leaderboards import _compute_parent_stats, _winner_uid
from app.utils import NIGHT_SHIFT_START, NIGHT_SHIFT_END


# ── Unit tests for pure helper functions ──────────────────────────────────────

class _FakeEvent:
    def __init__(self, logged_by: str, hour: int, etype: str = "feed", diaper_type: str | None = None):
        self.logged_by = logged_by
        self.timestamp = datetime(2024, 1, 15, hour, 0, 0, tzinfo=timezone.utc)
        self.type = etype
        self.metadata_ = {"diaper_type": diaper_type} if diaper_type else {}


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
        _FakeEvent("u1", 10, "diaper", "dirty"),
        _FakeEvent("u1", 11, "diaper", "both"),
        _FakeEvent("u1", 12, "diaper", "wet"),   # wet doesn't count
        _FakeEvent("u1", 13, "feed"),             # not a diaper
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
async def test_leaderboards_not_enough_data_when_events_are_recent(client_with_family):
    client, headers = client_with_family
    # Create an event with today's timestamp — less than 7 days old
    await client.post("/events", json={
        "id": "recent-feed", "type": "feed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    assert r.status_code == 200
    assert r.json()["has_enough_data"] is False


@pytest.mark.asyncio
async def test_leaderboards_enough_data_after_seven_days(client_with_family):
    client, headers = client_with_family
    old_ts = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    await client.post("/events", json={
        "id": "old-feed", "type": "feed",
        "timestamp": old_ts,
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)

    r = await client.get("/leaderboards", headers=headers)
    assert r.json()["has_enough_data"] is True


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
