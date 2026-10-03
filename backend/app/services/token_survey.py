"""Three analytics questions for Add tokens. All three must be answered to earn 10 tokens."""
from __future__ import annotations

from datetime import date
from typing import Any, Optional, TypedDict


class SurveyQuestion(TypedDict):
    id: str
    kind: str
    prompt: str
    choices: list[str]


SURVEY_TOKEN_REWARD = 10
SURVEY_QUESTION_COUNT = 3

# Fixed set — Add tokens always asks these three.
QUESTIONS: list[SurveyQuestion] = [
    {
        "id": "draw_priority",
        "kind": "analytics",
        "prompt": "Which Swertres draw do you actually play or watch?",
        "choices": ["9 AM most days", "4 PM most days", "9 PM most days", "I switch. No regular draw"],
    },
    {
        "id": "number_method",
        "kind": "analytics",
        "prompt": "When you pick three digits, what do you trust first?",
        "choices": ["Dream, sign, or gut feel", "A date or birthday", "Past results or a chart", "I pick at random"],
    },
    {
        "id": "bet_habit",
        "kind": "analytics",
        "prompt": "How often do you place a real Swertres bet?",
        "choices": ["Most draws this week", "A few times a week", "Only when I feel lucky", "I watch. I don't bet"],
    },
]


def question_by_id(qid: str) -> SurveyQuestion | None:
    for q in QUESTIONS:
        if q["id"] == qid:
            return q
    return None


def pick_questions(user_id: int, cal: date) -> list[SurveyQuestion]:
    del user_id, cal
    return list(QUESTIONS[:SURVEY_QUESTION_COUNT])


def validate_answer(question: SurveyQuestion, answer_raw: str) -> Optional[str]:
    answer = (answer_raw or "").strip()
    if answer not in question["choices"]:
        return None
    return answer


def question_public(q: SurveyQuestion) -> dict[str, Any]:
    return {"id": q["id"], "kind": q["kind"], "prompt": q["prompt"], "choices": q["choices"]}
