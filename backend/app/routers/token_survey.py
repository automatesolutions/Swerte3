"""Add tokens by answering three analytics questions (one reward per Manila day)."""
from __future__ import annotations

import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.token_survey import TokenSurveyAnswer
from app.models.user import User
from app.services.token_survey import (
    SURVEY_QUESTION_COUNT,
    SURVEY_TOKEN_REWARD,
    pick_questions,
    question_by_id,
    question_public,
    validate_answer,
)

router = APIRouter(prefix="/tokens", tags=["tokens"])


def _calendar_date_manila() -> date:
    return datetime.now(ZoneInfo("Asia/Manila")).date()


class SurveyQuestionOut(BaseModel):
    id: str
    kind: str
    prompt: str
    choices: list[str]


class SurveyNextOut(BaseModel):
    already_claimed: bool
    tokens_reward: int = SURVEY_TOKEN_REWARD
    question_count: int = SURVEY_QUESTION_COUNT
    premium_credits: int
    questions: list[SurveyQuestionOut] = []


class SurveyItemIn(BaseModel):
    question_id: str = Field(..., min_length=1, max_length=64)
    answer: str = Field(..., min_length=1, max_length=400)


class SurveyAnswerIn(BaseModel):
    answers: list[SurveyItemIn]


class SurveyAnswerOut(BaseModel):
    tokens_added: int
    premium_credits: int
    calendar_date: str


def _today_row(db: Session, user_id: int, cal: date) -> TokenSurveyAnswer | None:
    return (
        db.query(TokenSurveyAnswer)
        .filter(TokenSurveyAnswer.user_id == user_id, TokenSurveyAnswer.calendar_date == cal)
        .first()
    )


@router.get("/survey", response_model=SurveyNextOut)
def get_survey(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyNextOut:
    cal = _calendar_date_manila()
    if _today_row(db, user.id, cal):
        return SurveyNextOut(
            already_claimed=True,
            premium_credits=int(user.premium_credits or 0),
            questions=[],
        )
    questions = [SurveyQuestionOut.model_validate(question_public(q)) for q in pick_questions(user.id, cal)]
    return SurveyNextOut(
        already_claimed=False,
        premium_credits=int(user.premium_credits or 0),
        questions=questions,
    )


@router.post("/survey", response_model=SurveyAnswerOut)
def submit_survey(
    body: SurveyAnswerIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyAnswerOut:
    cal = _calendar_date_manila()
    if _today_row(db, user.id, cal):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already earned tokens today. Come back tomorrow for three new questions.",
        )

    expected = pick_questions(user.id, cal)
    expected_ids = [q["id"] for q in expected]
    incoming = {a.question_id.strip(): a.answer for a in body.answers}
    if set(incoming) != set(expected_ids) or len(incoming) != SURVEY_QUESTION_COUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Answer all three questions. Each one needs a choice from the list.",
        )

    stored: list[dict[str, str]] = []
    for q in expected:
        answer = validate_answer(q, incoming[q["id"]])
        if not answer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pick a listed choice for every question. Tokens are added only when all three are filled in.",
            )
        stored.append({"id": q["id"], "prompt": q["prompt"], "answer": answer})

    row = TokenSurveyAnswer(
        user_id=user.id,
        calendar_date=cal,
        question_id="bundle3",
        question_text=" | ".join(q["prompt"] for q in expected),
        kind="analytics",
        answer_text=json.dumps(stored, ensure_ascii=False),
        tokens_awarded=SURVEY_TOKEN_REWARD,
    )
    db.add(row)
    db.execute(
        update(User)
        .where(User.id == user.id)
        .values(premium_credits=User.premium_credits + SURVEY_TOKEN_REWARD)
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already earned tokens today. Come back tomorrow for three new questions.",
        ) from None

    db.refresh(user)
    return SurveyAnswerOut(
        tokens_added=SURVEY_TOKEN_REWARD,
        premium_credits=int(user.premium_credits or 0),
        calendar_date=cal.isoformat(),
    )
