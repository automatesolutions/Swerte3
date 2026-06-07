"""Elite gate: rotating multiple-choice question on every Elite entry (Asia/Manila)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.data.elite_profile_questions import ALL_QUESTIONS, question_for_gate_open
from app.models.elite_profile_daily_answer import EliteProfileDailyAnswer

MANILA = ZoneInfo("Asia/Manila")


def today_local() -> date:
    return datetime.now(MANILA).date()


def _question_payload(q) -> dict[str, Any]:
    return {
        "id": q.id,
        "prompt_en": q.prompt_en,
        "prompt_tl": q.prompt_tl,
        "kind": "select",
        "options": [
            {"value": o.value, "label_en": o.label_en, "label_tl": o.label_tl} for o in q.options
        ],
    }


def _answer_for_day(db: Session, user_id: int, d: date) -> EliteProfileDailyAnswer | None:
    return (
        db.query(EliteProfileDailyAnswer)
        .filter(
            EliteProfileDailyAnswer.user_id == user_id,
            EliteProfileDailyAnswer.calendar_date == d,
        )
        .first()
    )


def user_answered_today(db: Session, user_id: int, d: date | None = None) -> bool:
    day = d or today_local()
    row = _answer_for_day(db, user_id, day)
    return row is not None and bool(row.answer_value.strip())


def unlock_is_valid_today(unlock_at: datetime | None, d: date | None = None) -> bool:
    if unlock_at is None:
        return False
    day = d or today_local()
    if unlock_at.tzinfo is None:
        unlock_at = unlock_at.replace(tzinfo=timezone.utc)
    return unlock_at.astimezone(MANILA).date() == day


def get_next_question_payload(db: Session, user_id: int) -> dict[str, Any]:
    today = today_local()
    row = _answer_for_day(db, user_id, today)
    answered = row is not None and bool(row.answer_value.strip())
    last_question_id = row.question_id if answered and row else None
    session_q = question_for_gate_open(user_id, exclude_question_id=last_question_id)

    base: dict[str, Any] = {
        "gate_version": 2,
        "calendar_date": today.isoformat(),
        "todays_question_id": session_q.id,
        "already_answered_today": answered,
        # Gate is per Elite visit: client must POST /answer before premium even if answered earlier today.
        "elite_ready": False,
        "question": _question_payload(session_q),
    }
    if answered and row is not None and row.question_id == session_q.id:
        base["previous_answer"] = row.answer_value
    return base


def save_answer(db: Session, user_id: int, question_id: str, answer_value: str) -> dict[str, Any]:
    today = today_local()
    qdef = ALL_QUESTIONS.get(question_id)
    if not qdef:
        raise ValueError("Unknown question_id")

    value = answer_value.strip()
    if not value:
        raise ValueError("Pumili ng sagot bago magpatuloy.")

    allowed = {o.value for o in qdef.options}
    if value not in allowed:
        raise ValueError("Invalid option")

    row = _answer_for_day(db, user_id, today)
    if row:
        row.question_id = question_id
        row.answer_value = value
    else:
        db.add(
            EliteProfileDailyAnswer(
                user_id=user_id,
                calendar_date=today,
                question_id=question_id,
                answer_value=value,
            )
        )
    db.commit()
    return {
        "ok": True,
        "calendar_date": today.isoformat(),
        "already_answered_today": True,
        "elite_ready": True,
    }
