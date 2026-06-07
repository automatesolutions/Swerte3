"""Aggregate Elite gate answers for analytics board (PostgreSQL elite_profile_daily_answers)."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.data.elite_profile_questions import ALL_QUESTIONS, DAILY_QUESTIONS, question_for_calendar_day
from app.models.elite_profile_daily_answer import EliteProfileDailyAnswer
from app.models.user import User
from app.services.elite_profile import today_local


def _label_for_answer(question_id: str, answer_value: str) -> dict[str, str]:
    q = ALL_QUESTIONS.get(question_id)
    if not q:
        return {"label_en": answer_value, "label_tl": answer_value}
    for opt in q.options:
        if opt.value == answer_value:
            return {"label_en": opt.label_en, "label_tl": opt.label_tl}
    return {"label_en": answer_value, "label_tl": answer_value}


def build_elite_profile_board(db: Session) -> dict[str, Any]:
    """Counts per question/option plus today's gate snapshot."""
    today = today_local()
    todays_q = question_for_calendar_day(today)

    total_answers = db.query(EliteProfileDailyAnswer).count()
    answers_today = (
        db.query(EliteProfileDailyAnswer)
        .filter(EliteProfileDailyAnswer.calendar_date == today)
        .count()
    )
    unique_users = db.query(func.count(func.distinct(EliteProfileDailyAnswer.user_id))).scalar() or 0

    grouped = (
        db.query(
            EliteProfileDailyAnswer.question_id,
            EliteProfileDailyAnswer.answer_value,
            func.count().label("n"),
        )
        .group_by(EliteProfileDailyAnswer.question_id, EliteProfileDailyAnswer.answer_value)
        .all()
    )

    counts_by_q: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for question_id, answer_value, n in grouped:
        counts_by_q[question_id][answer_value] = int(n)

    by_question: list[dict[str, Any]] = []
    for qdef in sorted(DAILY_QUESTIONS, key=lambda q: q.order):
        q_counts = counts_by_q.get(qdef.id, {})
        total_for_q = sum(q_counts.values())
        options = []
        for opt in qdef.options:
            c = q_counts.get(opt.value, 0)
            options.append(
                {
                    "value": opt.value,
                    "label_en": opt.label_en,
                    "label_tl": opt.label_tl,
                    "count": c,
                    "pct": round(100.0 * c / total_for_q, 1) if total_for_q else 0.0,
                }
            )
        by_question.append(
            {
                "question_id": qdef.id,
                "prompt_en": qdef.prompt_en,
                "prompt_tl": qdef.prompt_tl,
                "total_responses": total_for_q,
                "options": options,
            }
        )

    todays_counts = counts_by_q.get(todays_q.id, {})
    todays_total = sum(todays_counts.values())
    todays_options = []
    for opt in todays_q.options:
        c = todays_counts.get(opt.value, 0)
        todays_options.append(
            {
                "value": opt.value,
                "label_en": opt.label_en,
                "label_tl": opt.label_tl,
                "count": c,
                "pct": round(100.0 * c / todays_total, 1) if todays_total else 0.0,
            }
        )

    daily_series = (
        db.query(
            EliteProfileDailyAnswer.calendar_date,
            func.count().label("n"),
        )
        .group_by(EliteProfileDailyAnswer.calendar_date)
        .order_by(EliteProfileDailyAnswer.calendar_date.desc())
        .limit(30)
        .all()
    )

    return {
        "calendar_date": today.isoformat(),
        "total_answers_all_time": total_answers,
        "answers_today": answers_today,
        "unique_users_all_time": unique_users,
        "todays_question": {
            "question_id": todays_q.id,
            "prompt_en": todays_q.prompt_en,
            "prompt_tl": todays_q.prompt_tl,
            "total_responses": todays_total,
            "options": todays_options,
        },
        "by_question": by_question,
        "daily_answer_counts": [
            {"calendar_date": d.isoformat(), "count": int(n)} for d, n in reversed(daily_series)
        ],
    }


def list_elite_answers_for_admin(
    db: Session,
    *,
    limit: int = 100,
    offset: int = 0,
    calendar_date: date | None = None,
    user_id: int | None = None,
) -> dict[str, Any]:
    """Paginated answer log for admins (how each user responded)."""
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    q = db.query(EliteProfileDailyAnswer, User).join(User, User.id == EliteProfileDailyAnswer.user_id)
    if calendar_date is not None:
        q = q.filter(EliteProfileDailyAnswer.calendar_date == calendar_date)
    if user_id is not None:
        q = q.filter(EliteProfileDailyAnswer.user_id == user_id)

    total = q.count()
    rows = (
        q.order_by(EliteProfileDailyAnswer.calendar_date.desc(), EliteProfileDailyAnswer.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items: list[dict[str, Any]] = []
    for ans, user in rows:
        qdef = ALL_QUESTIONS.get(ans.question_id)
        labels = _label_for_answer(ans.question_id, ans.answer_value)
        items.append(
            {
                "id": ans.id,
                "user_id": user.id,
                "display_alias": user.display_alias,
                "phone_e164": user.phone_e164,
                "calendar_date": ans.calendar_date.isoformat(),
                "question_id": ans.question_id,
                "question_en": qdef.prompt_en if qdef else ans.question_id,
                "question_tl": qdef.prompt_tl if qdef else ans.question_id,
                "answer_value": ans.answer_value,
                "answer_label_en": labels["label_en"],
                "answer_label_tl": labels["label_tl"],
                "created_at": ans.created_at.isoformat() if ans.created_at else None,
                "updated_at": ans.updated_at.isoformat() if ans.updated_at else None,
            }
        )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": items,
    }
