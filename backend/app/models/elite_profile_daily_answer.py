"""One multiple-choice Elite gate answer per user per calendar day."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class EliteProfileDailyAnswer(Base):
    __tablename__ = "elite_profile_daily_answers"
    __table_args__ = (UniqueConstraint("user_id", "calendar_date", name="uq_elite_profile_user_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    calendar_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    question_id: Mapped[str] = mapped_column(String(64), nullable=False)
    answer_value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
