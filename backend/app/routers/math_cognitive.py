"""Daily math cognitive puzzle: programmatic quadrant worksheet (cached per user per Manila day)."""
from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import get_current_user, get_db
from app.models.daily_math_cognitive import DailyMathCognitive
from app.models.user import User
from app.services.math_cognitive_daily import (
    MATH_COGNITIVE_RENDER_VERSION,
    bonus_tip_three_digits_random,
    fallback_booklet_prompt_en,
    generate_math_cognitive_puzzle,
    normalize_choice_guess,
)

router = APIRouter(prefix="/math-cognitive", tags=["math-cognitive"])


class DailyMathResponse(BaseModel):
    user_id: int = Field(
        description="Authenticated account (isang sagot/araw bawat user; ibang numero = ibang user).",
    )
    calendar_date: str
    mime_type: str
    image_base64: str
    booklet_prompt_en: str
    tip_tagalog: str
    title_tagalog: str | None = None
    question_number: int = Field(
        default=1,
        ge=1,
        le=31,
        description="Display index for booklet style (day of month in Manila)",
    )
    instruction_tagalog: str = "Alin ang susunod sa sequence? Pumili ng letrang A hanggang E."
    allow_guess: bool = Field(
        default=True,
        description="False kung naisumite na ang sagot ngayong araw para sa account na ito (bawat numero = hiwalay).",
    )


class GuessBody(BaseModel):
    guess: str = Field(..., min_length=1, max_length=12)


class GuessResponse(BaseModel):
    correct: bool
    message: str
    bonus_tip_digit_a: int | None = None
    bonus_tip_digit_b: int | None = None
    bonus_tip_digit_c: int | None = None
    submitted: bool = Field(
        default=False,
        description="True when this call counted as the one daily submission (valid A–E / 1–5).",
    )


def _calendar_date_manila() -> date:
    return datetime.now(ZoneInfo("Asia/Manila")).date()


def _advisory_lock_keys(user_id: int, cal: date) -> tuple[int, int]:
    dig = hashlib.sha256(f"daily_math_cog|{user_id}|{cal.isoformat()}".encode()).digest()
    k1 = int.from_bytes(dig[0:4], "big", signed=False) % (2**31)
    k2 = int.from_bytes(dig[4:8], "big", signed=False) % (2**31)
    return k1, k2


def _fetch_fresh_puzzle_row(db: Session, user_id: int, cal: date) -> DailyMathCognitive | None:
    """Return today’s row if it matches current render pipeline; delete and retry if stale (e.g. old DALL·E cache)."""
    while True:
        row = (
            db.query(DailyMathCognitive)
            .filter(DailyMathCognitive.user_id == user_id, DailyMathCognitive.calendar_date == cal)
            .first()
        )
        if row is None:
            return None
        if row.render_version >= MATH_COGNITIVE_RENDER_VERSION:
            return row
        db.delete(row)
        db.commit()


def _row_to_response(row: DailyMathCognitive, cal: date) -> DailyMathResponse:
    booklet = (row.booklet_prompt_en or "").strip()
    if not booklet:
        booklet = fallback_booklet_prompt_en(row.user_id, cal)
    qn = cal.day
    return DailyMathResponse(
        user_id=row.user_id,
        calendar_date=cal.isoformat(),
        mime_type=row.mime_type,
        image_base64=row.image_b64,
        booklet_prompt_en=booklet,
        tip_tagalog=row.tip_tagalog,
        title_tagalog=row.title_tagalog,
        question_number=qn,
        allow_guess=row.guess_submitted_at is None,
    )


@router.get("/daily", response_model=DailyMathResponse)
def get_daily_math(
    regenerate: bool = Query(
        False,
        description="When DEBUG=true, deletes today’s cached puzzle so the next image is rebuilt (dev / QA).",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DailyMathResponse:
    cal = _calendar_date_manila()
    settings = get_settings()

    if regenerate and settings.debug:
        db.query(DailyMathCognitive).filter(
            DailyMathCognitive.user_id == user.id,
            DailyMathCognitive.calendar_date == cal,
        ).delete()
        db.commit()

    row = _fetch_fresh_puzzle_row(db, user.id, cal)
    if row:
        return _row_to_response(row, cal)

    if db.get_bind().dialect.name == "postgresql":
        k1, k2 = _advisory_lock_keys(user.id, cal)
        db.execute(text("SELECT pg_advisory_xact_lock(:k1, :k2)"), {"k1": k1, "k2": k2})
        row = _fetch_fresh_puzzle_row(db, user.id, cal)
        if row:
            return _row_to_response(row, cal)

    try:
        b64, mime, answer, tip, title, booklet, rver = generate_math_cognitive_puzzle(user.id, cal, settings)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Puzzle generation failed: {e!s}",
        ) from e

    new_row = DailyMathCognitive(
        user_id=user.id,
        calendar_date=cal,
        image_b64=b64,
        mime_type=mime,
        expected_answer=answer,
        render_version=rver,
        tip_tagalog=tip,
        title_tagalog=title,
        booklet_prompt_en=booklet,
    )
    db.add(new_row)
    try:
        db.commit()
        db.refresh(new_row)
    except IntegrityError:
        db.rollback()
        row = (
            db.query(DailyMathCognitive)
            .filter(DailyMathCognitive.user_id == user.id, DailyMathCognitive.calendar_date == cal)
            .first()
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not load puzzle after concurrent create",
            ) from None
        return _row_to_response(row, cal)

    return _row_to_response(new_row, cal)


@router.post("/daily/guess", response_model=GuessResponse)
def post_daily_guess(
    body: GuessBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GuessResponse:
    cal = _calendar_date_manila()
    row = (
        db.query(DailyMathCognitive)
        .filter(DailyMathCognitive.user_id == user.id, DailyMathCognitive.calendar_date == cal)
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Walang puzzle ngayon — buksan muna ang screen para ma-load ang larawan ng araw.",
        )

    if row.guess_submitted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Naisumite mo na ang sagot ngayon para sa numerong ito. "
                "Isang beses lang bawat araw bawat account — ibang numero, hiwalay na quota. "
                "Bumalik bukas para sa parehong account."
            ),
        )

    g = normalize_choice_guess(body.guess)
    if g is None:
        return GuessResponse(
            correct=False,
            message="Pumili ng titik A hanggang E na tumutugma sa opsyon sa larawan.",
            submitted=False,
        )

    now = datetime.now(timezone.utc)
    letter_map = {1: "A", 2: "B", 3: "C", 4: "D", 5: "E"}
    ans = int(row.expected_answer, 10)
    letter = letter_map.get(ans, "")

    if int(g, 10) == ans:
        msg = f"Tama! Tamang letrang {letter}." if letter else f"Tama! Ang sagot ay {row.expected_answer}."
        d1, d2, d3 = bonus_tip_three_digits_random()
        row.guess_submitted_at = now
        db.commit()
        return GuessResponse(
            correct=True,
            message=msg,
            bonus_tip_digit_a=d1,
            bonus_tip_digit_b=d2,
            bonus_tip_digit_c=d3,
            submitted=True,
        )

    row.guess_submitted_at = now
    db.commit()
    return GuessResponse(
        correct=False,
        message="Hindi tama — suriin ang sequence at ang mga opsyon A hanggang E.",
        submitted=True,
    )
