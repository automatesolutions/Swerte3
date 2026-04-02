"""Cached OpenAI-generated daily picture puzzle (one per user per calendar day)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class DailyPictureAnalysis(Base):
    __tablename__ = "daily_picture_analyses"
    __table_args__ = (UniqueConstraint("user_id", "calendar_date", name="uq_daily_picture_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    calendar_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    image_b64: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(32), default="image/png", nullable=False)
    theme_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    render_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
