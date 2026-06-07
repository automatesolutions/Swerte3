from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models.draw import DrawSession
from app.models.user import User
from app.schemas.predict import DrawSessionEnum
from app.services import elite_profile as elite_profile_service
from app.services import predictions as pred_service

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
    **GINTO:** opens an Elite batch (no token charge). After profiling on the client,
    `GET /premium` for 9AM, 4PM, and 9PM does not require another start until the next GINTO.
    """
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not elite_profile_service.user_answered_today(db, u.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sagutin muna ang multiple-choice na tanong ngayong araw bago mag-Elite.",
        )

    u.lihim_premium_unlocked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(u)
    return {
        "premium_credits": int(u.premium_credits or 0),
        "lihim_unlocked": True,
        "charged": False,
    }


@router.get(
    "/premium",
    summary="Premium prediction (no per-call credit; requires an open Lihim batch)",
    description=(
        "**Auth:** JWT required.\n\n"
        "**Access:** Call `POST /predict/premium/start` (GINTO) after progressive profiling; then "
        "**9AM, 4PM, and 9PM** `GET /premium` calls work until the next GINTO."
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
    if not elite_profile_service.user_answered_today(db, u.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Sagutin ang multiple-choice na tanong ngayong araw bago kunin ang Elite hula."
            ),
        )
    if not elite_profile_service.unlock_is_valid_today(u.lihim_premium_unlocked_at):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Mag-GINTO muna sa Home pagkatapos sagutin ang tanong ngayong araw. "
                "Pagkatapos, puwede ang 9AM, 4PM, at 9PM."
            ),
        )
    return pred_service.predict_premium_for_session(db, u.id, _session(session))
