from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.database import get_db
from app.db.queries import get_user_baby_id
from app.config import settings
from app.limiter import limiter
from app.models.user import User
from app.auth import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    display_name: str
    baby_id: str | None  # None if the user is not yet linked to any baby


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.rate_limit_auth)
async def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    baby_id = await get_user_baby_id(db, user.id)

    return TokenResponse(
        access_token=create_access_token(user.id),
        token_type="bearer",
        user_id=user.id,
        display_name=user.display_name,
        baby_id=baby_id,
    )
