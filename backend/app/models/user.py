"""App user (phone-based)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone_e164: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    # Unique public nickname (letters, digits, underscore); case-insensitive uniqueness enforced in API.
    display_alias: Mapped[Optional[str]] = mapped_column(String(32), unique=True, nullable=True, index=True)
    # True until user saves real PH mobile on Home (guest bootstrap uses synthetic +639… number).
    is_placeholder_phone: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # True only for POST /auth/guest accounts; used to fix legacy rows where placeholder flag was wrong.
    is_guest_bootstrap: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    premium_credits: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Set by POST /predict/premium/start; while set, GET /predict/premium does not consume credits.
    lihim_premium_unlocked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    premium_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
