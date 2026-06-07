"""Admin-only analytics (Elite gate answers, etc.) — requires X-Admin-Key header."""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import admin_guard
from app.services.elite_profile_analytics import build_elite_profile_board, list_elite_answers_for_admin

router = APIRouter(prefix="/internal/admin", tags=["admin"])


@router.get("/elite-answers/summary")
def admin_elite_answers_summary(
    db: Session = Depends(get_db),
    _: None = Depends(admin_guard),
):
    """Aggregated counts: how users answer each Elite gate question (all time + today)."""
    return build_elite_profile_board(db)


@router.get("/elite-answers")
def admin_elite_answers_log(
    db: Session = Depends(get_db),
    _: None = Depends(admin_guard),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    calendar_date: Optional[date] = Query(None, description="Filter to one Manila calendar day (YYYY-MM-DD)"),
    user_id: Optional[int] = Query(None, ge=1),
):
    """Paginated log of individual Elite gate answers (user, question, chosen option)."""
    return list_elite_answers_for_admin(
        db,
        limit=limit,
        offset=offset,
        calendar_date=calendar_date,
        user_id=user_id,
    )
