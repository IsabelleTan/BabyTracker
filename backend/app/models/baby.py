from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String
from app.db.database import Base


class Baby(Base):
    __tablename__ = "babies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
