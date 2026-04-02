from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional, require_premium
from app.models.draw import DrawSession
from app.models.user import User
from app.schemas.predict import DrawSessionEnum
from app.services import predictions as pred_service
from app.services.premium_credits import consume_one_premium_credit, refund_one_premium_credit

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


@router.get(
    "/premium",
    summary="Premium prediction (consumes 1 credit)",
    description=(
        "**Auth:** Use the `access_token` from `POST /api/auth/otp/verify`. "
        "In Swagger, click **Authorize** (lock) and paste **only** the JWT string — "
        "do **not** type `Bearer:` or `Bearer `; Swagger adds the Bearer scheme.\n\n"
        "**Credits:** Needs `premium_credits` ≥ 1 on your user (JWT `sub` = user id). "
        "Dev: `UPDATE users SET premium_credits = 1 WHERE id = <sub>;`"
    ),
    response_description="Swertres premium payload (tier=premium); MiRo/council need LLM_API_KEY.",
)
def predict_premium(
    session: DrawSessionEnum,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_premium(user)
    if not consume_one_premium_credit(db, user.id):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="No premium predictions left. Complete payment to add credits.",
        )
    try:
        return pred_service.predict_premium_for_session(db, user.id, _session(session))
    except Exception:
        refund_one_premium_credit(db, user.id)
        raise
