import os

# Must be set before app modules are imported
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("DISABLE_RATE_LIMIT", "1")

import pytest_asyncio
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
async def client_with_family():
    """
    HTTP client with two parents (user-1, user-2) sharing baby-1.
    Yields (client, auth_headers) where auth_headers belong to user-1.
    """
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
        session.add(Baby(id="baby-1", name="Baby"))
        session.add(UserBaby(user_id="user-1", baby_id="baby-1"))
        session.add(UserBaby(user_id="user-2", baby_id="baby-1"))
        await session.commit()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    auth_headers = {"Authorization": f"Bearer {create_access_token('user-1')}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c, auth_headers

    app.dependency_overrides.clear()
    await engine.dispose()
