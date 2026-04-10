import enum
from datetime import datetime
from typing import Any
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, ForeignKey, DateTime, JSON, Enum as SAEnum
from app.db.database import Base


class EventType(str, enum.Enum):
    feed = "feed"
    sleep_start = "sleep_start"
    sleep_end = "sleep_end"
    diaper = "diaper"


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID set by client
    type: Mapped[EventType] = mapped_column(SAEnum(EventType), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    logged_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    baby_id: Mapped[str] = mapped_column(String(36), ForeignKey("babies.id"), nullable=False)
    metadata_: Mapped[Any] = mapped_column("metadata", JSON, nullable=True)

    author: Mapped["User"] = relationship("User", back_populates="events")  # noqa: F821
