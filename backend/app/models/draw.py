"""Draw history and ingestion audit."""
from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class DrawSession(str, enum.Enum):
    nine_am = "9am"
    four_pm = "4pm"
    nine_pm = "9pm"


class Draw(Base):
    __tablename__ = "draws"
    __table_args__ = (UniqueConstraint("session", "draw_at", "digit_1", "digit_2", "digit_3", name="uq_draw_identity"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session: Mapped[DrawSession] = mapped_column(
        Enum(DrawSession, name="draw_session", native_enum=False),
        index=True,
    )
    draw_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    digit_1: Mapped[int] = mapped_column(Integer)
    digit_2: Mapped[int] = mapped_column(Integer)
    digit_3: Mapped[int] = mapped_column(Integer)
    source_row_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    raw_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rows_inserted: Mapped[int] = mapped_column(Integer, default=0)
    rows_updated: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
