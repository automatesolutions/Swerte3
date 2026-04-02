"""Daily AI-generated black & white cartoon number puzzle."""
from __future__ import annotations

import hashlib
from datetime import date, datetime
from zoneinfo import ZoneInfo

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import get_current_user, get_db
from app.models.daily_picture_analysis import DailyPictureAnalysis
from app.models.user import User
from app.services.picture_analysis_image import PICTURE_ANALYSIS_RENDER_VERSION, generate_bw_cartoon

router = APIRouter(prefix="/picture-analysis", tags=["picture-analysis"])
logger = logging.getLogger(__name__)


class DailyPictureResponse(BaseModel):
    calendar_date: str = Field(
        ...,
        description="Calendar date for this puzzle (Asia/Manila). Image is generated at most once per user per this date.",
    )
    mime_type: str
    image_base64: str
    theme_key: str | None = None
    scene_hint: str


def _calendar_date_manila() -> date:
    return datetime.now(ZoneInfo("Asia/Manila")).date()


def _advisory_lock_keys(user_id: int, cal: date) -> tuple[int, int]:
    """Stable int pair for PostgreSQL pg_advisory_xact_lock (one generator per user per day under concurrency)."""
    dig = hashlib.sha256(f"daily_picture|{user_id}|{cal.isoformat()}".encode()).digest()
    k1 = int.from_bytes(dig[0:4], "big", signed=False) % (2**31)
    k2 = int.from_bytes(dig[4:8], "big", signed=False) % (2**31)
    return k1, k2


def _fetch_fresh_picture_row(db: Session, user_id: int, cal: date) -> DailyPictureAnalysis | None:
    """Return today’s row if it matches the current image pipeline; drop stale cached rows."""
    while True:
        row = (
            db.query(DailyPictureAnalysis)
            .filter(DailyPictureAnalysis.user_id == user_id, DailyPictureAnalysis.calendar_date == cal)
            .first()
        )
        if row is None:
            return None
        if row.render_version >= PICTURE_ANALYSIS_RENDER_VERSION:
            return row
        db.delete(row)
        db.commit()


def _hint_for_theme(theme_key: str | None) -> str:
    hints = {
        "sari_sari": "Tingnan ang presyo, chalkboard, at display — saan nakasulat ang mga digit?",
        "komiks_strip": "Basahin ang speech bubble at mga panel — may nakatagong numero.",
        "perya": "Tiket, booth, at laro — hanapin ang mga numero.",
        "school_kalye": "Sasakyan, pinto, at jersey — bilangin ang mga digit.",
        "tindahan_istilo": "Resibo, timbangan, at kalendaryo — saan nakasilip ang numero?",
    }
    if not theme_key:
        return "Hanapin ang lahat ng makikitang digit sa larawan."
    return hints.get(theme_key, "Hanapin ang lahat ng makikitang digit sa larawan.")


@router.get("/daily", response_model=DailyPictureResponse)
def get_daily_picture(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DailyPictureResponse:
    cal = _calendar_date_manila()
    settings = get_settings()

    # Fast path: already stored for this Manila calendar day → no OpenAI call.
    row = _fetch_fresh_picture_row(db, user.id, cal)
    if row:
        return DailyPictureResponse(
            calendar_date=cal.isoformat(),
            mime_type=row.mime_type,
            image_base64=row.image_b64,
            theme_key=row.theme_key,
            scene_hint=_hint_for_theme(row.theme_key),
        )

    # Under concurrent requests, only one worker may generate (PostgreSQL).
    if db.get_bind().dialect.name == "postgresql":
        k1, k2 = _advisory_lock_keys(user.id, cal)
        db.execute(text("SELECT pg_advisory_xact_lock(:k1, :k2)"), {"k1": k1, "k2": k2})
        row = _fetch_fresh_picture_row(db, user.id, cal)
        if row:
            return DailyPictureResponse(
                calendar_date=cal.isoformat(),
                mime_type=row.mime_type,
                image_base64=row.image_b64,
                theme_key=row.theme_key,
                scene_hint=_hint_for_theme(row.theme_key),
            )

    # First successful hit today: single OpenAI Images call, then persist (unique user+date).
    try:
        b64, mime, theme_key = generate_bw_cartoon(user.id, cal, settings)
    except RuntimeError as e:
        logger.warning("picture_analysis runtime: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serbisyo ng larawan ay pansamantalang hindi available. Subukan muli.",
        ) from e
    except Exception:
        logger.exception("picture_analysis image generation failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Hindi makagawa ng larawan ng puzzle. Subukan muli mamaya.",
        ) from None

    new_row = DailyPictureAnalysis(
        user_id=user.id,
        calendar_date=cal,
        image_b64=b64,
        mime_type=mime,
        theme_key=theme_key,
        render_version=PICTURE_ANALYSIS_RENDER_VERSION,
    )
    db.add(new_row)
    try:
        db.commit()
        db.refresh(new_row)
    except IntegrityError:
        db.rollback()
        row = (
            db.query(DailyPictureAnalysis)
            .filter(
                DailyPictureAnalysis.user_id == user.id,
                DailyPictureAnalysis.calendar_date == cal,
            )
            .first()
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not load picture after concurrent create",
            ) from None
        return DailyPictureResponse(
            calendar_date=cal.isoformat(),
            mime_type=row.mime_type,
            image_base64=row.image_b64,
            theme_key=row.theme_key,
            scene_hint=_hint_for_theme(row.theme_key),
        )

    return DailyPictureResponse(
        calendar_date=cal.isoformat(),
        mime_type=new_row.mime_type,
        image_base64=new_row.image_b64,
        theme_key=new_row.theme_key,
        scene_hint=_hint_for_theme(theme_key),
    )
