import pytest_asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.database import Base, get_db
from app.models.user import User
from app.models.baby import Baby
from app.models.user_baby import UserBaby
from app.auth import hash_password, create_access_token

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        session.add(User(id="user-1", email="p1@test.com", hashed_password=hash_password("pass"), display_name="Parent 1"))
        session.add(User(id="user-2", email="p2@test.com", hashed_password=hash_password("pass"), display_name="Parent 2"))
        session.add(User(id="user-3", email="p3@test.com", hashed_password=hash_password("pass"), display_name="Other Family"))
        session.add(Baby(id="baby-1", name="Baby"))
        session.add(Baby(id="baby-2", name="Other Baby"))
        # user-1 and user-2 share baby-1; user-3 is linked to a separate baby
        session.add(UserBaby(user_id="user-1", baby_id="baby-1"))
        session.add(UserBaby(user_id="user-2", baby_id="baby-1"))
        session.add(UserBaby(user_id="user-3", baby_id="baby-2"))
        await session.commit()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest_asyncio.fixture
def auth_headers():
    token = create_access_token("user-1")
    return {"Authorization": f"Bearer {token}"}


EVENT_PAYLOAD = {
    "id": "evt-001",
    "type": "feed",
    "timestamp": "2024-01-15T10:00:00Z",
    "metadata": {"feed_type": "bottle", "amount_ml": 120},
}


async def test_create_event(client, auth_headers):
    r = await client.post("/events", json=EVENT_PAYLOAD, headers=auth_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["id"] == "evt-001"
    assert data["type"] == "feed"
    assert data["display_name"] == "Parent 1"
    assert data["logged_by"] == "user-1"


async def test_create_event_requires_auth(client):
    r = await client.post("/events", json=EVENT_PAYLOAD)
    assert r.status_code == 401


async def test_create_event_idempotent(client, auth_headers):
    await client.post("/events", json=EVENT_PAYLOAD, headers=auth_headers)
    r = await client.post("/events", json=EVENT_PAYLOAD, headers=auth_headers)
    assert r.status_code == 201  # second post is a silent no-op


async def test_get_events_by_range(client, auth_headers):
    await client.post("/events", json=EVENT_PAYLOAD, headers=auth_headers)
    r = await client.get("/events", params={"from_": "2024-01-15T00:00:00Z", "to": "2024-01-16T00:00:00Z"}, headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


async def test_get_events_since(client, auth_headers):
    await client.post("/events", json=EVENT_PAYLOAD, headers=auth_headers)
    r = await client.get("/events", params={"since": "2024-01-14T00:00:00Z"}, headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


async def test_get_events_no_params(client, auth_headers):
    r = await client.get("/events", headers=auth_headers)
    assert r.status_code == 422


async def test_delete_event(client, auth_headers):
    await client.post("/events", json=EVENT_PAYLOAD, headers=auth_headers)
    r = await client.delete("/events/evt-001", headers=auth_headers)
    assert r.status_code == 204


async def test_delete_event_not_found(client, auth_headers):
    r = await client.delete("/events/nonexistent", headers=auth_headers)
    assert r.status_code == 404


async def test_feed_breast_metadata_round_trip(client, auth_headers):
    payload = {
        "id": "evt-breast",
        "type": "feed",
        "timestamp": "2024-01-15T10:00:00Z",
        "metadata": {"feed_type": "breast", "left_duration_min": 8, "right_duration_min": 5},
    }
    r = await client.post("/events", json=payload, headers=auth_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["metadata"]["feed_type"] == "breast"
    assert data["metadata"]["left_duration_min"] == 8
    assert data["metadata"]["right_duration_min"] == 5


async def test_feed_bottle_metadata_round_trip(client, auth_headers):
    payload = {
        "id": "evt-bottle",
        "type": "feed",
        "timestamp": "2024-01-15T11:00:00Z",
        "metadata": {"feed_type": "bottle", "amount_ml": 120},
    }
    r = await client.post("/events", json=payload, headers=auth_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["metadata"]["feed_type"] == "bottle"
    assert data["metadata"]["amount_ml"] == 120


async def test_output_metadata_round_trip(client, auth_headers):
    for diaper_type in ("wet", "dirty", "both"):
        for location in ("diaper", "potty"):
            payload = {
                "id": f"evt-output-{diaper_type}-{location}",
                "type": "output",
                "timestamp": "2024-01-15T12:00:00Z",
                "metadata": {"diaper_type": diaper_type, "location": location},
            }
            r = await client.post("/events", json=payload, headers=auth_headers)
            assert r.status_code == 201
            assert r.json()["metadata"]["diaper_type"] == diaper_type
            assert r.json()["metadata"]["location"] == location


async def test_invalid_token_returns_401(client):
    bad_headers = {"Authorization": "Bearer not-a-valid-token"}
    r = await client.post("/events", json=EVENT_PAYLOAD, headers=bad_headers)
    assert r.status_code == 401


async def test_events_outside_range_excluded(client, auth_headers):
    # Event on Jan 15
    await client.post("/events", json=EVENT_PAYLOAD, headers=auth_headers)
    # Query Jan 16 — should return nothing
    r = await client.get(
        "/events",
        params={"from_": "2024-01-16T00:00:00Z", "to": "2024-01-17T00:00:00Z"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_limit_returns_last_n_events(client, auth_headers):
    # Log 3 feed events and 1 diaper
    for i in range(3):
        await client.post(
            "/events",
            json={"id": f"feed-{i}", "type": "feed", "timestamp": f"2024-01-15T0{i}:00:00Z",
                  "metadata": {"feed_type": "bottle", "amount_ml": 100}},
            headers=auth_headers,
        )
    await client.post(
        "/events",
        json={"id": "diaper-1", "type": "output", "timestamp": "2024-01-15T10:00:00Z",
              "metadata": {"diaper_type": "wet", "location": "diaper"}},
        headers=auth_headers,
    )
    # Fetch last 2 events overall
    r = await client.get("/events", params={"limit": 2}, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2


async def test_limit_with_type_filter(client, auth_headers):
    for i in range(3):
        await client.post(
            "/events",
            json={"id": f"feed-type-{i}", "type": "feed", "timestamp": f"2024-01-15T0{i}:00:00Z",
                  "metadata": {"feed_type": "bottle", "amount_ml": 100}},
            headers=auth_headers,
        )
    await client.post(
        "/events",
        json={"id": "diaper-type-1", "type": "output", "timestamp": "2024-01-15T10:00:00Z",
              "metadata": {"diaper_type": "wet", "location": "diaper"}},
        headers=auth_headers,
    )
    # Fetch last 2 feeds only
    r = await client.get("/events", params={"type": "feed", "limit": 2}, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert all(e["type"] == "feed" for e in data)


async def test_feed_event_without_metadata_rejected(client, auth_headers):
    r = await client.post(
        "/events",
        json={"id": "feed-no-meta", "type": "feed", "timestamp": "2024-01-15T10:00:00Z"},
        headers=auth_headers,
    )
    assert r.status_code == 422


async def test_output_event_without_metadata_rejected(client, auth_headers):
    r = await client.post(
        "/events",
        json={"id": "output-no-meta", "type": "output", "timestamp": "2024-01-15T10:00:00Z"},
        headers=auth_headers,
    )
    assert r.status_code == 422


async def test_sleep_event_with_metadata_rejected(client, auth_headers):
    r = await client.post(
        "/events",
        json={"id": "sleep-with-meta", "type": "sleep_start", "timestamp": "2024-01-15T10:00:00Z",
              "metadata": {"unexpected": "field"}},
        headers=auth_headers,
    )
    assert r.status_code == 422


async def test_delete_event_by_co_parent_is_allowed(client, auth_headers):
    # user-1 logs an event; user-2 shares the same baby → should be allowed to delete
    await client.post("/events", json=EVENT_PAYLOAD, headers=auth_headers)
    user2_headers = {"Authorization": f"Bearer {create_access_token('user-2')}"}
    r = await client.delete("/events/evt-001", headers=user2_headers)
    assert r.status_code == 204


async def test_delete_event_by_unrelated_user_is_forbidden(client, auth_headers):
    # user-1 logs an event; user-3 is on a different baby → should be forbidden
    await client.post("/events", json=EVENT_PAYLOAD, headers=auth_headers)
    user3_headers = {"Authorization": f"Bearer {create_access_token('user-3')}"}
    r = await client.delete("/events/evt-001", headers=user3_headers)
    assert r.status_code == 403


async def test_bottle_event_with_invalid_bottle_type_rejected(client, auth_headers):
    """bottle_type must be 'pumped' or 'formula'; anything else should return 422."""
    r = await client.post(
        "/events",
        json={"id": "bad-bottle", "type": "feed", "timestamp": "2024-01-15T10:00:00Z",
              "metadata": {"feed_type": "bottle", "amount_ml": 100, "bottle_type": "banana"}},
        headers=auth_headers,
    )
    assert r.status_code == 422


async def test_bottle_event_with_valid_pumped_type_accepted(client, auth_headers):
    r = await client.post(
        "/events",
        json={"id": "pumped-bottle", "type": "feed", "timestamp": "2024-01-15T10:00:00Z",
              "metadata": {"feed_type": "bottle", "amount_ml": 120, "bottle_type": "pumped"}},
        headers=auth_headers,
    )
    assert r.status_code == 201


async def test_bottle_event_with_valid_formula_type_accepted(client, auth_headers):
    r = await client.post(
        "/events",
        json={"id": "formula-bottle", "type": "feed", "timestamp": "2024-01-15T10:00:00Z",
              "metadata": {"feed_type": "bottle", "amount_ml": 90, "bottle_type": "formula"}},
        headers=auth_headers,
    )
    assert r.status_code == 201


_NOW = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)


async def test_future_timestamp_beyond_24h_rejected(client, auth_headers):
    too_far = (_NOW + timedelta(hours=24, seconds=1)).isoformat()
    with patch("app.routers.events._utcnow", return_value=_NOW):
        r = await client.post(
            "/events",
            json={"id": "future-bad", "type": "sleep_start", "timestamp": too_far},
            headers=auth_headers,
        )
    assert r.status_code == 422
    assert "future" in r.json()["detail"].lower()


async def test_future_timestamp_exactly_24h_accepted(client, auth_headers):
    exactly_24h = (_NOW + timedelta(hours=24)).isoformat()
    with patch("app.routers.events._utcnow", return_value=_NOW):
        r = await client.post(
            "/events",
            json={"id": "future-ok", "type": "sleep_start", "timestamp": exactly_24h},
            headers=auth_headers,
        )
    assert r.status_code == 201


async def test_past_timestamp_accepted(client, auth_headers):
    past = (_NOW - timedelta(days=1)).isoformat()
    with patch("app.routers.events._utcnow", return_value=_NOW):
        r = await client.post(
            "/events",
            json={"id": "past-ok", "type": "sleep_start", "timestamp": past},
            headers=auth_headers,
        )
    assert r.status_code == 201
