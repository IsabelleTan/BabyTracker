from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_baby import UserBaby


def baby_ids_for_user(user_id: str):
    """Subquery: all baby_ids linked to a user."""
    return select(UserBaby.baby_id).where(UserBaby.user_id == user_id)


async def get_user_baby_id(db: AsyncSession, user_id: str) -> str | None:
    """Return the first baby_id linked to a user, or None."""
    return await db.scalar(
        select(UserBaby.baby_id).where(UserBaby.user_id == user_id).limit(1)
    )


async def get_users_map(db: AsyncSession, user_ids: set[str]) -> dict[str, str]:
    """Return {user_id: display_name} for the given set of user IDs."""
    result = await db.execute(select(User).where(User.id.in_(user_ids)))
    return {u.id: u.display_name for u in result.scalars().all()}
