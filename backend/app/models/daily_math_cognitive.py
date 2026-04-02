"""Cached daily math cognitive puzzle (programmatic PNG, one per user per Manila day)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class DailyMathCognitive(Base):
    __tablename__ = "daily_math_cognitives"
    __table_args__ = (UniqueConstraint("user_id", "calendar_date", name="uq_daily_math_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    calendar_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    image_b64: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(32), default="image/png", nullable=False)
    expected_answer: Mapped[str] = mapped_column(String(8), nullable=False)
    render_version: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    tip_tagalog: Mapped[str] = mapped_column(Text, nullable=False)
    title_tagalog: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    booklet_prompt_en: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    guess_submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
