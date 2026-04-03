"""PayMongo-style webhooks and payment recording."""
from __future__ import annotations

import json
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models.payment import PaymentEvent
from app.models.user import User
from app.services.paymongo import verify_paymongo_signature

router = APIRouter(prefix="/payments", tags=["payments"])

_PESO_PER_TOKEN = 2


class TokenTopupRequest(BaseModel):
    provider: str = Field(..., pattern="^(gcash|maya|gotyme)$")
    amount_pesos: int = Field(..., ge=2)


class TokenTopupResponse(BaseModel):
    provider: str
    amount_pesos: int
    tokens_added: int
    premium_credits: int


def _grant_premium(db: Session, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return
    n = get_settings().premium_credits_per_payment
    user.premium_credits = (user.premium_credits or 0) + n
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


@router.post("/topup", response_model=TokenTopupResponse)
def topup_tokens(
    body: TokenTopupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tokens_to_add = body.amount_pesos // _PESO_PER_TOKEN
    if tokens_to_add < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum top-up is {_PESO_PER_TOKEN} pesos for 1 token.",
        )

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.premium_credits = int(user.premium_credits or 0) + tokens_to_add
    db.commit()
    db.refresh(user)

    return TokenTopupResponse(
        provider=body.provider,
        amount_pesos=body.amount_pesos,
        tokens_added=tokens_to_add,
        premium_credits=int(user.premium_credits or 0),
    )
