from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.analytics_dashboard import build_dashboard

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
def analytics_dashboard(
    session: Optional[Literal["9am", "4pm", "9pm"]] = None,
    db: Session = Depends(get_db),
):
    """Gaussian-style scatter (sum vs log product), co-occurrence matrix, transition graphs, error histogram (DB-backed)."""
    return build_dashboard(db, session=session)
