"""Persisted match between a stored prediction and the next actual draw (error analytics)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class PredictionOutcome(Base):
    __tablename__ = "prediction_outcomes"
    __table_args__ = (UniqueConstraint("prediction_record_id", "session", name="uq_outcome_record_session"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prediction_record_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prediction_records.id", ondelete="CASCADE"), index=True
    )
    session: Mapped[str] = mapped_column(String(8), index=True)
    draw_id: Mapped[int] = mapped_column(Integer, ForeignKey("draws.id"), index=True)
    hamming: Mapped[int] = mapped_column(Integer)
    predicted_digit_1: Mapped[int] = mapped_column(Integer)
    predicted_digit_2: Mapped[int] = mapped_column(Integer)
    predicted_digit_3: Mapped[int] = mapped_column(Integer)
    actual_digit_1: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_digit_2: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_digit_3: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
