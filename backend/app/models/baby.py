from datetime import date
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Date
from app.db.database import Base


class Baby(Base):
    __tablename__ = "babies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
