from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional, require_premium
from app.models.draw import DrawSession
from app.models.user import User
from app.schemas.predict import DrawSessionEnum
from app.services import predictions as pred_service
from app.services.premium_credits import consume_one_premium_credit

router = APIRouter(prefix="/predict", tags=["predict"])


def _session(s: DrawSessionEnum) -> DrawSession:
    return DrawSession(s.value)


@router.get("/free")
def predict_free(
    session: DrawSessionEnum,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    payload = pred_service.predict_free_for_session(db, _session(session))
    pred_service.log_free_prediction(db, payload, user_id=user.id if user else None)
    return payload


@router.get("/free/daily")
def predict_free_daily(
    target_date: date,
    variation_key: str | None = None,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    payload = pred_service.predict_free_for_date_all_sessions(db, target_date, variation_key=variation_key)
    pred_service.log_free_prediction(db, payload, user_id=user.id if user else None)
    return payload


@router.post("/premium/start")
def premium_start_batch(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    **GINTO:** always spends **1 token** per call (multi-agent LLM + analytics compute / API cost).
    After that, `GET /premium` for 9AM, 4PM, and 9PM does **not** deduct further credits until the next GINTO.
    """
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    require_premium(u)
    if not consume_one_premium_credit(db, u.id):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Kailangan ng token para sa Lihim. Gumagamit ito ng maraming LLM agents at analytics — "
                "kailangan ng compute at API cost. Mag-top up (hal. 2 pesos = 1 token)."
            ),
        )
    u.lihim_premium_unlocked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(u)
    return {
        "premium_credits": int(u.premium_credits or 0),
        "lihim_unlocked": True,
        "charged": True,
    }


@router.get(
    "/premium",
    summary="Premium prediction (no per-call credit; requires an open Lihim batch)",
    description=(
        "**Auth:** JWT from `POST /api/auth/otp/verify`.\n\n"
        "**Credits:** Each `POST /predict/premium/start` (GINTO) consumes **one** token; then "
        "**9AM, 4PM, and 9PM** `GET /premium` calls do not deduct further until the next GINTO."
    ),
    response_description="Swertres premium payload (tier=premium); MiRo/council need LLM_API_KEY.",
)
def predict_premium(
    session: DrawSessionEnum,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if u.lihim_premium_unlocked_at is None:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Mag-GINTO muna sa app — 1 token bawat GINTO (LLM/compute). "
                "Pagkatapos, puwede ang 9AM, 4PM, 9PM nang walang dagdag-bawas hanggang sa susunod na GINTO."
            ),
        )
    return pred_service.predict_premium_for_session(db, u.id, _session(session))
