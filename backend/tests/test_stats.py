from datetime import datetime, timezone, timedelta
import pytest


@pytest.mark.asyncio
async def test_stats_zero_events(client_with_family):
    client, headers = client_with_family
    r = await client.get("/stats/daily", params={"from": "2024-01-15T05:00:00Z", "to": "2024-01-15T05:00:00Z"}, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    day = data[0]
    assert day["date"] == "2024-01-15"
    assert day["feed_count"] == 0
    assert day["total_sleep_min"] == 0
    assert day["sleep_session_count"] == 0
    assert day["diaper_count"] == 0
    assert day["avg_feed_interval_min"] is None
    assert day["avg_sleep_session_min"] is None


@pytest.mark.asyncio
async def test_stats_feed_interval(client_with_family):
    client, headers = client_with_family
    # Two feeds 120 minutes apart on the same day
    for i, time in enumerate(["08:00", "10:00"]):
        await client.post("/events", json={
            "id": f"feed-{i}", "type": "feed",
            "timestamp": f"2024-01-15T{time}:00Z",
            "metadata": {"feed_type": "bottle", "amount_ml": 100},
        }, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T05:00:00Z", "to": "2024-01-15T05:00:00Z"}, headers=headers)
    assert r.status_code == 200
    day = r.json()[0]
    assert day["feed_count"] == 2
    assert day["avg_feed_interval_min"] == 120.0


@pytest.mark.asyncio
async def test_stats_single_sleep_session(client_with_family):
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "s1", "type": "sleep_start", "timestamp": "2024-01-15T20:00:00Z",
    }, headers=headers)
    await client.post("/events", json={
        "id": "e1", "type": "sleep_end", "timestamp": "2024-01-15T22:00:00Z",
    }, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T05:00:00Z", "to": "2024-01-15T05:00:00Z"}, headers=headers)
    day = r.json()[0]
    assert day["sleep_session_count"] == 1
    assert day["total_sleep_min"] == 120
    assert day["avg_sleep_session_min"] == 120.0


@pytest.mark.asyncio
async def test_stats_sleep_spanning_midnight(client_with_family):
    """A session starting Jan 15 at 23:00 and ending Jan 16 at 01:00 is attributed to Jan 15."""
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "s-mid", "type": "sleep_start", "timestamp": "2024-01-15T23:00:00Z",
    }, headers=headers)
    await client.post("/events", json={
        "id": "e-mid", "type": "sleep_end", "timestamp": "2024-01-16T01:00:00Z",
    }, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T05:00:00Z", "to": "2024-01-16T05:00:00Z"}, headers=headers)
    days = {d["date"]: d for d in r.json()}
    # 120-minute session starts on Jan 15 → attributed to Jan 15
    assert days["2024-01-15"]["sleep_session_count"] == 1
    assert days["2024-01-15"]["total_sleep_min"] == 120
    assert days["2024-01-16"]["sleep_session_count"] == 0


@pytest.mark.asyncio
async def test_stats_wake_time_between_sessions(client_with_family):
    """Two sessions with a 60-minute gap → avg_wake_min = 60."""
    client, headers = client_with_family
    for sid, start, end in [
        ("s1", "08:00", "09:00"),
        ("s2", "10:00", "11:00"),
    ]:
        await client.post("/events", json={"id": sid, "type": "sleep_start", "timestamp": f"2024-01-15T{start}:00Z"}, headers=headers)
        await client.post("/events", json={"id": f"e{sid}", "type": "sleep_end", "timestamp": f"2024-01-15T{end}:00Z"}, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T05:00:00Z", "to": "2024-01-15T05:00:00Z"}, headers=headers)
    day = r.json()[0]
    assert day["avg_wake_min"] == 60.0


@pytest.mark.asyncio
async def test_stats_daily_rejects_range_over_366_days(client_with_family):
    client, headers = client_with_family
    r = await client.get("/stats/daily", params={
        "from": "2023-01-01T00:00:00Z",
        "to": "2024-12-31T00:00:00Z",  # ~730 days
    }, headers=headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_stats_range_returns_earliest_event(client_with_family):
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "range-feed", "type": "feed", "timestamp": "2024-01-10T08:00:00Z",
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)

    r = await client.get("/stats/range", headers=headers)
    assert r.status_code == 200
    assert r.json()["earliest"].startswith("2024-01-10")


# ── Edge cases ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stats_daily_rejects_from_after_to(client_with_family):
    """from > to should return 422 (the range is negative, not just zero)."""
    client, headers = client_with_family
    r = await client.get("/stats/daily", params={
        "from": "2024-01-20T00:00:00Z",
        "to":   "2024-01-15T00:00:00Z",  # earlier than from
    }, headers=headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_stats_daily_no_events_returns_zeros(client_with_family):
    """A range with no events returns one row per day, all zeroed out."""
    client, headers = client_with_family
    r = await client.get("/stats/daily", params={
        "from": "2024-03-01T00:00:00Z",
        "to":   "2024-03-03T00:00:00Z",
    }, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 3
    for day in data:
        assert day["feed_count"] == 0
        assert day["diaper_count"] == 0
        assert day["total_sleep_min"] == 0
        assert day["avg_feed_interval_min"] is None


@pytest.mark.asyncio
async def test_stats_daily_boundary_inclusive(client_with_family):
    """Events exactly at from and to boundaries are included."""
    client, headers = client_with_family
    # Event precisely at midnight (from boundary)
    await client.post("/events", json={
        "id": "boundary-feed", "type": "feed",
        "timestamp": "2024-02-01T00:00:00Z",
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-02-01T00:00:00Z",
        "to":   "2024-02-01T23:59:59Z",
    }, headers=headers)
    assert r.status_code == 200
    assert r.json()[0]["feed_count"] == 1


@pytest.mark.asyncio
async def test_stats_range_returns_null_when_no_events(client_with_family):
    client, headers = client_with_family
    r = await client.get("/stats/range", headers=headers)
    assert r.status_code == 200
    assert r.json()["earliest"] is None


@pytest.mark.asyncio
async def test_stats_diaper_count(client_with_family):
    """Diaper events are counted per day regardless of type."""
    client, headers = client_with_family
    for i, dtype in enumerate(["wet", "dirty", "both"]):
        await client.post("/events", json={
            "id": f"diaper-{i}", "type": "diaper",
            "timestamp": f"2024-02-10T{8 + i:02d}:00:00Z",
            "metadata": {"diaper_type": dtype},
        }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-02-10T05:00:00Z",
        "to":   "2024-02-10T23:59:59Z",
    }, headers=headers)
    assert r.json()[0]["diaper_count"] == 3


@pytest.mark.asyncio
async def test_stats_wet_dirty_breakdown(client_with_family):
    """wet and both count toward wet_count; dirty and both count toward dirty_count."""
    client, headers = client_with_family
    for i, dtype in enumerate(["wet", "dirty", "both"]):
        await client.post("/events", json={
            "id": f"wdb-{i}", "type": "diaper",
            "timestamp": f"2024-03-05T{8 + i:02d}:00:00Z",
            "metadata": {"diaper_type": dtype},
        }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-03-05T05:00:00Z",
        "to":   "2024-03-05T23:59:59Z",
    }, headers=headers)
    day = r.json()[0]
    assert day["wet_count"]   == 2  # "wet" + "both"
    assert day["dirty_count"] == 2  # "dirty" + "both"


@pytest.mark.asyncio
async def test_stats_breast_min_and_bottle_ml(client_with_family):
    """breast_min sums left+right durations; pumped_ml and formula_ml are split by bottle_type."""
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "bf1", "type": "feed", "timestamp": "2024-03-06T07:00:00Z",
        "metadata": {"feed_type": "breast", "left_duration_min": 10, "right_duration_min": 8},
    }, headers=headers)
    await client.post("/events", json={
        "id": "bf2", "type": "feed", "timestamp": "2024-03-06T10:00:00Z",
        "metadata": {"feed_type": "breast", "left_duration_min": 5, "right_duration_min": None},
    }, headers=headers)
    await client.post("/events", json={
        "id": "bt1", "type": "feed", "timestamp": "2024-03-06T13:00:00Z",
        "metadata": {"feed_type": "bottle", "bottle_type": "pumped", "amount_ml": 120},
    }, headers=headers)
    await client.post("/events", json={
        "id": "bt2", "type": "feed", "timestamp": "2024-03-06T16:00:00Z",
        "metadata": {"feed_type": "bottle", "bottle_type": "formula", "amount_ml": 90},
    }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-03-06T05:00:00Z",
        "to":   "2024-03-06T23:59:59Z",
    }, headers=headers)
    day = r.json()[0]
    assert day["breast_min"]  == 23.0   # 10+8 + 5+0
    assert day["pumped_ml"]   == 120.0
    assert day["formula_ml"]  == 90.0


@pytest.mark.asyncio
async def test_stats_legacy_bottle_counts_as_pumped(client_with_family):
    """Bottle events without bottle_type (legacy) are counted in pumped_ml."""
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "legacy-bt", "type": "feed", "timestamp": "2024-03-07T09:00:00Z",
        "metadata": {"feed_type": "bottle", "amount_ml": 100},
    }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-03-07T05:00:00Z",
        "to":   "2024-03-07T23:59:59Z",
    }, headers=headers)
    day = r.json()[0]
    assert day["pumped_ml"]  == 100.0
    assert day["formula_ml"] == 0.0
