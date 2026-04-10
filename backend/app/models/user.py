from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String
from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)

    events: Mapped[list["Event"]] = relationship("Event", back_populates="author")  # noqa: F821
