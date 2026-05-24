"""Progressive profiling before Elite access."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services import elite_profile as elite_profile_service

router = APIRouter(prefix="/elite/profile", tags=["elite-profile"])


class EliteProfileAnswerBody(BaseModel):
    question_id: str = Field(..., min_length=1, max_length=64)
    answer: str = Field(..., min_length=1, max_length=500)


@router.get("/next")
def get_next_profile_question(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Next single question to show before this Elite visit (progressive over time)."""
    return elite_profile_service.get_next_question_payload(db, user.id)


@router.post("/answer")
def submit_profile_answer(
    body: EliteProfileAnswerBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return elite_profile_service.save_answer(db, user.id, body.question_id, body.answer)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
