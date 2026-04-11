"""
Account management CLI — create babies and user accounts.

Usage:
    # Create a baby (prints the baby ID you'll need for create-user)
    poetry run python seed.py create-baby --name "Baby" --dob 2024-11-03

    # List all babies and their IDs
    poetry run python seed.py list-babies

    # Create a user and link them to a baby
    poetry run python seed.py create-user --email parent@example.com --display-name "Mum" --baby-id <id>
    # You will be prompted for a password (not shown, not logged).
"""
import argparse
import asyncio
import getpass
import uuid
from datetime import date
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from app.db.database import Base
from app.models import *  # noqa
from app.models.user import User
from app.models.baby import Baby
from app.models.user_baby import UserBaby
from app.auth import hash_password

DATABASE_URL = "sqlite+aiosqlite:///./babytracker.db"
MIN_PASSWORD_LENGTH = 12


async def _get_session_factory():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


async def cmd_create_baby(name: str, dob: date | None) -> None:
    engine, session_factory = await _get_session_factory()
    baby_id = str(uuid.uuid4())
    async with session_factory() as session:
        session.add(Baby(id=baby_id, name=name, date_of_birth=dob))
        await session.commit()
    await engine.dispose()
    print(f"Baby '{name}' created.")
    print(f"Baby ID: {baby_id}")
    if dob:
        print(f"Date of birth: {dob}")


async def cmd_list_babies() -> None:
    engine, session_factory = await _get_session_factory()
    async with session_factory() as session:
        rows = (await session.execute(select(Baby))).scalars().all()
    await engine.dispose()
    if not rows:
        print("No babies found.")
        return
    for baby in rows:
        print(f"{baby.id}  {baby.name}")


async def cmd_create_user(email: str, display_name: str, baby_id: str, password: str) -> None:
    engine, session_factory = await _get_session_factory()
    async with session_factory() as session:
        # Verify baby exists
        baby = await session.get(Baby, baby_id)
        if baby is None:
            raise SystemExit(f"No baby found with ID '{baby_id}'. Run list-babies to see available IDs.")

        # Check email not already taken
        existing = await session.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise SystemExit(f"A user with email '{email}' already exists.")

        user_id = str(uuid.uuid4())
        session.add(User(
            id=user_id,
            email=email,
            hashed_password=hash_password(password),
            display_name=display_name,
        ))
        session.add(UserBaby(user_id=user_id, baby_id=baby_id))
        await session.commit()

    await engine.dispose()
    print(f"User '{display_name}' ({email}) created and linked to baby '{baby.name}'.")


def _prompt_password() -> str:
    while True:
        password = getpass.getpass("Password: ")
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f"Password must be at least {MIN_PASSWORD_LENGTH} characters. Try again.")
            continue
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Passwords do not match. Try again.")
            continue
        return password


def main() -> None:
    parser = argparse.ArgumentParser(description="BabyTracker account management")
    sub = parser.add_subparsers(dest="command", required=True)

    # create-baby
    p_baby = sub.add_parser("create-baby", help="Create a new baby profile")
    p_baby.add_argument("--name", required=True, help="Baby's name")
    p_baby.add_argument("--dob", default=None, help="Date of birth in YYYY-MM-DD format (optional)")

    # list-babies
    sub.add_parser("list-babies", help="List all babies and their IDs")

    # create-user
    p_user = sub.add_parser("create-user", help="Create a parent account")
    p_user.add_argument("--email", required=True, help="Login email address")
    p_user.add_argument("--display-name", required=True, help="Name shown in the app")
    p_user.add_argument("--baby-id", required=True, help="Baby ID to link this user to (from list-babies)")

    args = parser.parse_args()

    if args.command == "create-baby":
        dob = date.fromisoformat(args.dob) if args.dob else None
        asyncio.run(cmd_create_baby(args.name, dob))
    elif args.command == "list-babies":
        asyncio.run(cmd_list_babies())
    elif args.command == "create-user":
        password = _prompt_password()
        asyncio.run(cmd_create_user(args.email, args.display_name, args.baby_id, password))


if __name__ == "__main__":
    main()
