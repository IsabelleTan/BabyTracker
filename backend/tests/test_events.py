import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.database import Base, get_db
from app.models.user import User
from app.models.baby import Baby
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
        session.add(Baby(id="baby-1", name="Baby"))
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
