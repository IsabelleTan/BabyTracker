"""
Run once to create the two parent accounts and the shared baby profile.

Usage:
    poetry run python seed.py
"""
import asyncio
import uuid
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.db.database import Base
from app.models import *  # noqa
from app.models.user import User
from app.models.baby import Baby
from app.models.user_baby import UserBaby
from app.auth import hash_password

DATABASE_URL = "sqlite+aiosqlite:///./babytracker.db"

PARENTS = [
    {"display_name": "Parent 1", "email": "parent1@family.local", "password": "changeme1"},
    {"display_name": "Parent 2", "email": "parent2@family.local", "password": "changeme2"},
]

BABY_NAME = "Baby"


async def seed():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    baby_id = str(uuid.uuid4())

    async with session_factory() as session:
        baby = Baby(id=baby_id, name=BABY_NAME)
        session.add(baby)

        for p in PARENTS:
            user_id = str(uuid.uuid4())
            user = User(
                id=user_id,
                email=p["email"],
                hashed_password=hash_password(p["password"]),
                display_name=p["display_name"],
            )
            session.add(user)
            session.add(UserBaby(user_id=user_id, baby_id=baby_id))

        await session.commit()

    await engine.dispose()
    print("Seeded successfully.")
    print(f"Baby: {BABY_NAME}")
    for p in PARENTS:
        print(f"  {p['display_name']}: {p['email']} / {p['password']}")


if __name__ == "__main__":
    asyncio.run(seed())
