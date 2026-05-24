"""Pick the next progressive profiling question for an Elite visit."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.data.elite_profile_questions import (
    ALL_QUESTIONS,
    PRIMARY_QUESTIONS,
    REPEATABLE_QUESTIONS,
    EliteProfileQuestionDef,
)
from app.models.elite_profile_answer import EliteProfileAnswer


def _question_payload(q: EliteProfileQuestionDef) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": q.id,
        "prompt_en": q.prompt_en,
        "prompt_tl": q.prompt_tl,
        "kind": q.kind,
        "repeatable": q.repeatable,
    }
    if q.placeholder_en:
        out["placeholder_en"] = q.placeholder_en
    if q.placeholder_tl:
        out["placeholder_tl"] = q.placeholder_tl
    if q.options:
        out["options"] = [
            {"value": o.value, "label_en": o.label_en, "label_tl": o.label_tl} for o in q.options
        ]
    return out


def _answered_ids(db: Session, user_id: int) -> set[str]:
    rows = db.query(EliteProfileAnswer.question_id).filter(EliteProfileAnswer.user_id == user_id).all()
    return {r[0] for r in rows}


def profile_progress(db: Session, user_id: int) -> dict[str, int]:
    answered = _answered_ids(db, user_id)
    primary_ids = {q.id for q in PRIMARY_QUESTIONS}
    primary_answered = len(answered & primary_ids)
    return {
        "primary_answered": primary_answered,
        "primary_total": len(PRIMARY_QUESTIONS),
        "total_answered": len(answered),
    }


def next_question_for_visit(db: Session, user_id: int) -> EliteProfileQuestionDef | None:
    """One question per Elite access — next primary unanswered, else rotating repeatable."""
    answered = _answered_ids(db, user_id)
    for q in sorted(PRIMARY_QUESTIONS, key=lambda x: x.order):
        if q.id not in answered:
            return q

    # All primary done — pick repeatable with oldest updated_at (or never answered).
    best: EliteProfileQuestionDef | None = None
    best_ts: float | None = None
    for q in REPEATABLE_QUESTIONS:
        row = (
            db.query(EliteProfileAnswer)
            .filter(EliteProfileAnswer.user_id == user_id, EliteProfileAnswer.question_id == q.id)
            .first()
        )
        ts = row.updated_at.timestamp() if row else 0.0
        if best is None or ts < (best_ts or 0.0):
            best = q
            best_ts = ts
    return best


def get_next_question_payload(db: Session, user_id: int) -> dict[str, Any]:
    q = next_question_for_visit(db, user_id)
    progress = profile_progress(db, user_id)
    if q is None:
        return {"question": None, "progress": progress}
    return {"question": _question_payload(q), "progress": progress}


def save_answer(db: Session, user_id: int, question_id: str, answer_value: str) -> dict[str, Any]:
    qdef = ALL_QUESTIONS.get(question_id)
    if not qdef:
        raise ValueError("Unknown question_id")

    value = answer_value.strip()
    if not value:
        raise ValueError("Answer required")

    if qdef.kind == "select" and qdef.options:
        allowed = {o.value for o in qdef.options}
        if value not in allowed:
            raise ValueError("Invalid option")

    if qdef.kind == "text" and len(value) > 120:
        raise ValueError("Answer too long")

    row = (
        db.query(EliteProfileAnswer)
        .filter(EliteProfileAnswer.user_id == user_id, EliteProfileAnswer.question_id == question_id)
        .first()
    )
    if row:
        row.answer_value = value
    else:
        db.add(
            EliteProfileAnswer(
                user_id=user_id,
                question_id=question_id,
                answer_value=value,
            )
        )
    db.commit()
    return {"ok": True, "progress": profile_progress(db, user_id)}
