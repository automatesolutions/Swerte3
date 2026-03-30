from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional, require_premium
from app.models.draw import DrawSession
from app.models.user import User
from app.schemas.predict import DrawSessionEnum
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


@router.get("/premium")
def predict_premium(
    session: DrawSessionEnum,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_premium(user)
    return pred_service.predict_premium_for_session(db, user.id, _session(session))
