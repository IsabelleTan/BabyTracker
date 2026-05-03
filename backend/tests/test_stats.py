from datetime import datetime, timezone, timedelta
import pytest


# ── /stats/streaks ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_streaks_no_events(client_with_family):
    client, headers = client_with_family
    r = await client.get("/stats/streaks", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["current_potty_streak"] is None
    assert data["total_potty_events"] == 0
    assert data["days_logged_total"] == 0


@pytest.mark.asyncio
async def test_streaks_single_potty_today(client_with_family):
    client, headers = client_with_family
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    await client.post("/events", json={
        "id": "streak-potty-1", "type": "output",
        "timestamp": now,
        "metadata": {"diaper_type": "wet", "location": "potty"},
    }, headers=headers)

    r = await client.get("/stats/streaks", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["current_potty_streak"] is None  # single day — no multi-day streak yet
    assert data["total_potty_events"] == 1
    assert data["days_logged_total"] == 1


@pytest.mark.asyncio
async def test_streaks_two_consecutive_days(client_with_family):
    client, headers = client_with_family
    today = datetime.now(timezone.utc)
    yesterday = today - timedelta(days=1)
    for ts, eid in [(yesterday, "streak-potty-y"), (today, "streak-potty-t")]:
        await client.post("/events", json={
            "id": eid, "type": "output",
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "metadata": {"diaper_type": "wet", "location": "potty"},
        }, headers=headers)

    r = await client.get("/stats/streaks", headers=headers)
    data = r.json()
    assert data["current_potty_streak"] == 2

    assert data["total_potty_events"] == 2


@pytest.mark.asyncio
async def test_streaks_expired_streak(client_with_family):
    """Potty event 2+ days ago → streak is 0 but event still counts in total."""
    client, headers = client_with_family
    two_days_ago = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    await client.post("/events", json={
        "id": "streak-potty-old", "type": "output",
        "timestamp": two_days_ago,
        "metadata": {"diaper_type": "wet", "location": "potty"},
    }, headers=headers)

    r = await client.get("/stats/streaks", headers=headers)
    data = r.json()
    assert data["current_potty_streak"] is None  # expired — no active streak
    assert data["total_potty_events"] == 1


@pytest.mark.asyncio
async def test_streaks_days_logged_distinct(client_with_family):
    """Multiple events on the same day count as one logged day."""
    client, headers = client_with_family
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for i in range(3):
        await client.post("/events", json={
            "id": f"streak-feed-{i}", "type": "feed",
            "timestamp": now,
            "metadata": {"pumped_ml": 100},
        }, headers=headers)

    r = await client.get("/stats/streaks", headers=headers)
    data = r.json()
    assert data["days_logged_total"] == 1


@pytest.mark.asyncio
async def test_stats_zero_events(client_with_family):
    client, headers = client_with_family
    r = await client.get("/stats/daily", params={"from": "2024-01-15T00:00:00Z", "to": "2024-01-15T00:00:00Z"}, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    day = data[0]
    assert day["date"] == "2024-01-15"
    assert day["feed_count"] == 0
    assert day["total_sleep_min"] == 0
    assert day["sleep_session_count"] == 0
    assert day["output_count"] == 0
    assert day["median_feed_interval_min"] is None
    assert day["median_sleep_session_min"] is None


@pytest.mark.asyncio
async def test_stats_feed_interval(client_with_family):
    client, headers = client_with_family
    # Two feeds 120 minutes apart on the same day
    for i, time in enumerate(["08:00", "10:00"]):
        await client.post("/events", json={
            "id": f"feed-{i}", "type": "feed",
            "timestamp": f"2024-01-15T{time}:00Z",
            "metadata": {"pumped_ml": 100},
        }, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T00:00:00Z", "to": "2024-01-15T00:00:00Z"}, headers=headers)
    assert r.status_code == 200
    day = r.json()[0]
    assert day["feed_count"] == 2
    assert day["median_feed_interval_min"] == 120.0


@pytest.mark.asyncio
async def test_stats_single_sleep_session(client_with_family):
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "s1", "type": "sleep_start", "timestamp": "2024-01-15T20:00:00Z",
    }, headers=headers)
    await client.post("/events", json={
        "id": "e1", "type": "sleep_end", "timestamp": "2024-01-15T22:00:00Z",
    }, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T00:00:00Z", "to": "2024-01-15T00:00:00Z"}, headers=headers)
    day = r.json()[0]
    assert day["sleep_session_count"] == 1
    assert day["total_sleep_min"] == 120
    assert day["median_sleep_session_min"] == 120.0


@pytest.mark.asyncio
async def test_stats_sleep_spanning_midnight(client_with_family):
    """A session crossing midnight is attributed to the day of its midpoint.
    23:00–01:00 (midpoint exactly midnight) → all 120 min on Jan 16, zero on Jan 15."""
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "s-mid", "type": "sleep_start", "timestamp": "2024-01-15T23:00:00Z",
    }, headers=headers)
    await client.post("/events", json={
        "id": "e-mid", "type": "sleep_end", "timestamp": "2024-01-16T01:00:00Z",
    }, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T00:00:00Z", "to": "2024-01-16T00:00:00Z"}, headers=headers)
    days = {d["date"]: d for d in r.json()}
    # Midpoint is exactly Jan 16 00:00 → session attributed to Jan 16
    assert days["2024-01-15"]["sleep_session_count"] == 0
    assert days["2024-01-15"]["total_sleep_min"] == 0
    assert days["2024-01-16"]["sleep_session_count"] == 1
    assert days["2024-01-16"]["total_sleep_min"] == 120


@pytest.mark.asyncio
async def test_stats_sleep_midpoint_attribution(client_with_family):
    """Overnight sessions are attributed to the day of their midpoint, both directions.

    Jan 14 23:00→Jan 15 07:00 (midpoint Jan 15 03:00): all 480 min on Jan 15.
    Jan 15 10:00→12:00: 120 min on Jan 15 (control).
    Jan 15 23:00→Jan 16 01:30 (midpoint Jan 16 00:15): all 150 min on Jan 16, zero on Jan 15.
    """
    client, headers = client_with_family
    for sid, start, end in [
        ("s1", "2024-01-14T23:00:00Z", "2024-01-15T07:00:00Z"),
        ("s2", "2024-01-15T10:00:00Z", "2024-01-15T12:00:00Z"),
        ("s3", "2024-01-15T23:00:00Z", "2024-01-16T01:30:00Z"),
    ]:
        await client.post("/events", json={"id": sid, "type": "sleep_start", "timestamp": start}, headers=headers)
        await client.post("/events", json={"id": f"e{sid}", "type": "sleep_end", "timestamp": end}, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T00:00:00Z", "to": "2024-01-16T00:00:00Z"}, headers=headers)
    days = {d["date"]: d for d in r.json()}
    assert days["2024-01-15"]["sleep_session_count"] == 2
    assert days["2024-01-15"]["total_sleep_min"] == 480 + 120
    assert days["2024-01-16"]["sleep_session_count"] == 1
    assert days["2024-01-16"]["total_sleep_min"] == 150


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

    r = await client.get("/stats/daily", params={"from": "2024-01-15T00:00:00Z", "to": "2024-01-15T00:00:00Z"}, headers=headers)
    day = r.json()[0]
    assert day["median_wake_min"] == 60.0


@pytest.mark.asyncio
async def test_stats_sleep_session_durations(client_with_family):
    """Three sleep sessions: all individual durations, median, and wake times are returned correctly."""
    client, headers = client_with_family
    for sid, start, end in [
        ("sb1", "08:00", "08:30"),  # 30 min  — wake after: 90 min
        ("sb2", "10:00", "11:00"),  # 60 min  — wake after: 120 min
        ("sb3", "13:00", "14:30"),  # 90 min
    ]:
        await client.post("/events", json={"id": sid, "type": "sleep_start", "timestamp": f"2024-01-15T{start}:00Z"}, headers=headers)
        await client.post("/events", json={"id": f"e{sid}", "type": "sleep_end", "timestamp": f"2024-01-15T{end}:00Z"}, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T00:00:00Z", "to": "2024-01-15T00:00:00Z"}, headers=headers)
    day = r.json()[0]
    assert day["sleep_session_durations_min"] == [30.0, 60.0, 90.0]
    assert day["median_sleep_session_min"] == 60.0
    assert day["wake_durations_min"] == [90.0, 120.0]
    assert day["median_wake_min"] == 105.0


@pytest.mark.asyncio
async def test_stats_wake_midpoint_attribution(client_with_family):
    """Wake gap spanning midnight is attributed to the day of its midpoint.
    Session ends 22:00 Jan 15, next starts 00:30 Jan 16 → 150-min wake, midpoint 23:15 Jan 15 → counted for Jan 15."""
    client, headers = client_with_family
    for sid, start, end in [
        ("s-wk1", "2024-01-15T20:00:00Z", "2024-01-15T22:00:00Z"),
        ("s-wk2", "2024-01-16T00:30:00Z", "2024-01-16T02:00:00Z"),
    ]:
        await client.post("/events", json={"id": sid, "type": "sleep_start", "timestamp": start}, headers=headers)
        await client.post("/events", json={"id": f"e-{sid}", "type": "sleep_end", "timestamp": end}, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T00:00:00Z", "to": "2024-01-16T00:00:00Z"}, headers=headers)
    days = {d["date"]: d for d in r.json()}
    # Wake gap 22:00–00:30 = 150 min, midpoint 23:15 → Jan 15
    assert days["2024-01-15"]["median_wake_min"] == 150.0
    assert days["2024-01-16"]["median_wake_min"] is None


@pytest.mark.asyncio
async def test_stats_feed_interval_midpoint_attribution(client_with_family):
    """Feed interval spanning midnight is attributed to the day of its midpoint.
    Feed at 23:00 Jan 15, next at 01:00 Jan 16 → 120-min interval, midpoint 00:00 Jan 16 → counted for Jan 16."""
    client, headers = client_with_family
    for fid, ts in [
        ("f-mi1", "2024-01-15T23:00:00Z"),
        ("f-mi2", "2024-01-16T01:00:00Z"),
    ]:
        await client.post("/events", json={
            "id": fid, "type": "feed", "timestamp": ts,
            "metadata": {"pumped_ml": 100},
        }, headers=headers)

    r = await client.get("/stats/daily", params={"from": "2024-01-15T00:00:00Z", "to": "2024-01-16T00:00:00Z"}, headers=headers)
    days = {d["date"]: d for d in r.json()}
    # Interval midpoint is exactly midnight → Jan 16
    assert days["2024-01-15"]["median_feed_interval_min"] is None
    assert days["2024-01-16"]["median_feed_interval_min"] == 120.0


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
        "metadata": {"pumped_ml": 100},
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
        assert day["output_count"] == 0
        assert day["total_sleep_min"] == 0
        assert day["median_feed_interval_min"] is None


@pytest.mark.asyncio
async def test_stats_daily_boundary_inclusive(client_with_family):
    """Events exactly at from and to boundaries are included."""
    client, headers = client_with_family
    # Event precisely at midnight (from boundary)
    await client.post("/events", json={
        "id": "boundary-feed", "type": "feed",
        "timestamp": "2024-02-01T00:00:00Z",
        "metadata": {"pumped_ml": 100},
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
async def test_stats_output_count(client_with_family):
    """Output events are counted per day regardless of type."""
    client, headers = client_with_family
    for i, dtype in enumerate(["wet", "dirty", "both"]):
        await client.post("/events", json={
            "id": f"output-{i}", "type": "output",
            "timestamp": f"2024-02-10T{8 + i:02d}:00:00Z",
            "metadata": {"diaper_type": dtype, "location": "diaper"},
        }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-02-10T00:00:00Z",
        "to":   "2024-02-10T23:59:59Z",
    }, headers=headers)
    assert r.json()[0]["output_count"] == 3


@pytest.mark.asyncio
async def test_stats_wet_dirty_breakdown(client_with_family):
    """wet and both count toward wet_count; dirty and both count toward dirty_count."""
    client, headers = client_with_family
    for i, dtype in enumerate(["wet", "dirty", "both"]):
        await client.post("/events", json={
            "id": f"wdb-{i}", "type": "output",
            "timestamp": f"2024-03-05T{8 + i:02d}:00:00Z",
            "metadata": {"diaper_type": dtype, "location": "diaper"},
        }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-03-05T00:00:00Z",
        "to":   "2024-03-05T23:59:59Z",
    }, headers=headers)
    day = r.json()[0]
    assert day["wet_count"] == 2  # "wet" + "both"
    assert day["dirty_count"] == 2  # "dirty" + "both"


@pytest.mark.asyncio
async def test_stats_breast_min_and_bottle_ml(client_with_family):
    """breast_min sums left+right durations; pumped_ml and formula_ml are tracked separately."""
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "bf1", "type": "feed", "timestamp": "2024-03-06T07:00:00Z",
        "metadata": {"breast_left_min": 10, "breast_right_min": 8},
    }, headers=headers)
    await client.post("/events", json={
        "id": "bf2", "type": "feed", "timestamp": "2024-03-06T10:00:00Z",
        "metadata": {"breast_left_min": 5, "breast_right_min": None},
    }, headers=headers)
    await client.post("/events", json={
        "id": "bt1", "type": "feed", "timestamp": "2024-03-06T13:00:00Z",
        "metadata": {"pumped_ml": 120},
    }, headers=headers)
    await client.post("/events", json={
        "id": "bt2", "type": "feed", "timestamp": "2024-03-06T16:00:00Z",
        "metadata": {"formula_ml": 90},
    }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-03-06T00:00:00Z",
        "to":   "2024-03-06T23:59:59Z",
    }, headers=headers)
    day = r.json()[0]
    assert day["breast_min"] == 10+8 + 5+0
    assert day["pumped_ml"] == 120.0
    assert day["formula_ml"] == 90.0


@pytest.mark.asyncio
async def test_stats_cross_family_isolation(client_with_family):
    """User-3 (separate family, baby-2) must not see user-1's events on baby-1."""
    from app.auth import create_access_token
    client, headers = client_with_family
    user3_headers = {"Authorization": f"Bearer {create_access_token('user-3')}"}

    # user-1 logs an event on baby-1
    await client.post("/events", json={
        "id": "isolation-feed", "type": "feed",
        "timestamp": "2024-01-15T10:00:00Z",
        "metadata": {"pumped_ml": 100},
    }, headers=headers)

    # user-1 sees it in their stats
    r1 = await client.get("/stats/daily", params={
        "from": "2024-01-15T00:00:00Z",
        "to":   "2024-01-15T23:59:59Z",
    }, headers=headers)
    assert r1.json()[0]["feed_count"] == 1

    # user-3 queries the same range — must see 0 (scoped to baby-2 only)
    r3 = await client.get("/stats/daily", params={
        "from": "2024-01-15T00:00:00Z",
        "to":   "2024-01-15T23:59:59Z",
    }, headers=user3_headers)
    assert r3.status_code == 200
    assert r3.json()[0]["feed_count"] == 0


@pytest.mark.asyncio
async def test_stats_combined_feed_event(client_with_family):
    """A single event with breast + pumped fields contributes to both stats."""
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "combined-feed", "type": "feed", "timestamp": "2024-03-07T09:00:00Z",
        "metadata": {"breast_left_min": 8, "breast_right_min": 5, "pumped_ml": 60},
    }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-03-07T00:00:00Z",
        "to":   "2024-03-07T23:59:59Z",
    }, headers=headers)
    day = r.json()[0]
    assert day["breast_min"] == 8 + 5
    assert day["pumped_ml"]  == 60.0
    assert day["formula_ml"] == 0.0
    assert day["feed_count"] == 1


@pytest.mark.asyncio
async def test_stats_accident_counts_breakdown(client_with_family):
    """Accident events appear in accident_wet/dirty counts and also roll into wet/dirty totals."""
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "acc-wet", "type": "output",
        "timestamp": "2024-04-01T09:00:00Z",
        "metadata": {"diaper_type": "wet", "location": "accident"},
    }, headers=headers)
    await client.post("/events", json={
        "id": "acc-both", "type": "output",
        "timestamp": "2024-04-01T14:00:00Z",
        "metadata": {"diaper_type": "both", "location": "accident"},
    }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-04-01T00:00:00Z",
        "to":   "2024-04-01T23:59:59Z",
    }, headers=headers)
    day = r.json()[0]
    assert day["output_count"] == 2
    assert day["accident_wet_count"] == 2  # wet + both
    assert day["accident_dirty_count"] == 1  # both only
    assert day["wet_count"] == 2  # accidents roll into the total
    assert day["dirty_count"] == 1


@pytest.mark.asyncio
async def test_stats_summary_empty(client_with_family):
    """Summary returns zeros with no events."""
    client, headers = client_with_family
    r = await client.get("/stats/summary", headers=headers)
    assert r.status_code == 200
    data = r.json()
    for key in ("breast_min", "pumped_ml", "formula_ml", "wet", "dirty", "sleep_min"):
        assert data[key]["current"] == 0.0
        assert data[key]["average"] == 0.0


@pytest.mark.asyncio
async def test_stats_summary_recent_events_in_current(client_with_family):
    """Events within the past 24h appear in current; no history means average is 0."""
    from datetime import datetime, timezone
    client, headers = client_with_family
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    await client.post("/events", json={
        "id": "sum-feed", "type": "feed", "timestamp": now,
        "metadata": {"pumped_ml": 100, "breast_left_min": 10, "breast_right_min": 5},
    }, headers=headers)
    await client.post("/events", json={
        "id": "sum-wet", "type": "output", "timestamp": now,
        "metadata": {"diaper_type": "wet", "location": "diaper"},
    }, headers=headers)

    r = await client.get("/stats/summary", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["pumped_ml"]["current"] == 100.0
    assert data["breast_min"]["current"] == 15.0
    assert data["wet"]["current"] == 1.0
    assert data["dirty"]["current"] == 0.0
    assert data["pumped_ml"]["average"] == 0.0  # no history yet


@pytest.mark.asyncio
async def test_stats_summary_old_events_excluded_from_current(client_with_family):
    """Events older than 24h are excluded from current but counted in average."""
    from datetime import datetime, timezone, timedelta
    client, headers = client_with_family
    old_ts = (datetime.now(timezone.utc) - timedelta(hours=25)).strftime("%Y-%m-%dT%H:%M:%SZ")
    await client.post("/events", json={
        "id": "sum-old", "type": "feed", "timestamp": old_ts,
        "metadata": {"pumped_ml": 80},
    }, headers=headers)

    r = await client.get("/stats/summary", headers=headers)
    data = r.json()
    assert data["pumped_ml"]["current"] == 0.0
    assert data["pumped_ml"]["average"] == 80.0  # falls in the d=1 history window


@pytest.mark.asyncio
async def test_stats_summary_cross_family_isolation(client_with_family):
    """user-3 must not see user-1's events in their summary."""
    from app.auth import create_access_token
    from datetime import datetime, timezone
    client, headers = client_with_family
    user3_headers = {"Authorization": f"Bearer {create_access_token('user-3')}"}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    await client.post("/events", json={
        "id": "sum-iso", "type": "feed", "timestamp": now,
        "metadata": {"pumped_ml": 200},
    }, headers=headers)

    r = await client.get("/stats/summary", headers=user3_headers)
    assert r.status_code == 200
    assert r.json()["pumped_ml"]["current"] == 0.0


@pytest.mark.asyncio
async def test_stats_accident_does_not_appear_in_potty_counts(client_with_family):
    """An accident event must not be counted in potty_wet_count or potty_dirty_count."""
    client, headers = client_with_family
    await client.post("/events", json={
        "id": "acc-only", "type": "output",
        "timestamp": "2024-04-02T10:00:00Z",
        "metadata": {"diaper_type": "dirty", "location": "accident"},
    }, headers=headers)

    r = await client.get("/stats/daily", params={
        "from": "2024-04-02T00:00:00Z",
        "to":   "2024-04-02T23:59:59Z",
    }, headers=headers)
    day = r.json()[0]
    assert day["potty_wet_count"] == 0
    assert day["potty_dirty_count"] == 0
    assert day["accident_dirty_count"] == 1
