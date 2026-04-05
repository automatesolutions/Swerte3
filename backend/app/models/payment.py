"""Payment events (PayPal capture id, legacy PayMongo ids)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class PaymentEvent(Base):
    __tablename__ = "payment_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    external_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(32), default="paypal")
    amount_centavos: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="PHP")
    status: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    raw_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PaymongoCheckoutBinding(Base):
    """Legacy PayMongo mapping (unused when using PayPal)."""

    __tablename__ = "paymongo_checkout_bindings"

    checkout_session_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    amount_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PaypalOrderBinding(Base):
    """PayPal order id → user until capture completes."""

    __tablename__ = "paypal_order_bindings"

    order_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    amount_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
