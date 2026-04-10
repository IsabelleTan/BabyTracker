import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.database import Base, get_db
from app.models.user import User
from app.auth import hash_password

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
        session.add(User(id="user-1", email="parent1@test.com", hashed_password=hash_password("secret"), display_name="Parent 1"))
        await session.commit()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()
    await engine.dispose()


async def test_login_success(client):
    r = await client.post("/auth/login", data={"username": "parent1@test.com", "password": "secret"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["display_name"] == "Parent 1"
    assert data["user_id"] == "user-1"


async def test_login_wrong_password(client):
    r = await client.post("/auth/login", data={"username": "parent1@test.com", "password": "wrong"})
    assert r.status_code == 401


async def test_login_unknown_email(client):
    r = await client.post("/auth/login", data={"username": "unknown@test.com", "password": "secret"})
    assert r.status_code == 401
