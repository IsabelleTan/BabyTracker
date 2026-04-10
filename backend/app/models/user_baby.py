from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey
from app.db.database import Base


class UserBaby(Base):
    __tablename__ = "user_babies"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), primary_key=True)
    baby_id: Mapped[str] = mapped_column(String(36), ForeignKey("babies.id"), primary_key=True)
