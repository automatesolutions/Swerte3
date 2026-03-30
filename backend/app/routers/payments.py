"""PayMongo-style webhooks and payment recording."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.payment import PaymentEvent
from app.models.user import User
from app.services.paymongo import verify_paymongo_signature

router = APIRouter(prefix="/payments", tags=["payments"])


def _grant_premium(db: Session, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return
    days = get_settings().premium_grant_days_per_payment
    base = user.premium_until or datetime.now(timezone.utc)
    if base < datetime.now(timezone.utc):
        base = datetime.now(timezone.utc)
    user.premium_until = base + timedelta(days=days)
    db.commit()


@router.post("/webhook/paymongo")
async def paymongo_webhook(
    request: Request,
    db: Session = Depends(get_db),
    paymongo_signature: str | None = Header(None, alias="Paymongo-Signature"),
):
    body = await request.body()
    if not verify_paymongo_signature(body, paymongo_signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")
    try:
        payload: Dict[str, Any] = json.loads(body.decode() or "{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    data = payload.get("data") or {}
    attrs = data.get("attributes") or {}
    pid = str(data.get("id") or attrs.get("id") or "unknown")
    status_str = str(attrs.get("status") or payload.get("status") or "")
    amount = int(attrs.get("amount") or 0)
    meta = (attrs.get("metadata") or {}) if isinstance(attrs.get("metadata"), dict) else {}

    existing = db.query(PaymentEvent).filter(PaymentEvent.external_id == pid).first()
    if existing:
        return {"received": True, "duplicate": True}

    uid = meta.get("user_id")
    user_id = int(uid) if uid is not None and str(uid).isdigit() else None

    ev = PaymentEvent(
        external_id=pid,
        amount_centavos=amount,
        status=status_str,
        user_id=user_id,
        raw_payload=json.dumps(payload, default=str)[:8000],
    )
    db.add(ev)
    db.commit()

    if status_str.lower() in ("paid", "payment.paid", "succeeded") and user_id:
        _grant_premium(db, user_id)

    return {"received": True}
