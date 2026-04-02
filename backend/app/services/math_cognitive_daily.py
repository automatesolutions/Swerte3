"""Daily cognitive puzzle: programmatic quadrant-circle worksheet (no DALL·E)."""
from __future__ import annotations

import hashlib
import logging
import re
import secrets
from datetime import date

from app.config import Settings
from app.services.math_cognitive_render import (
    BOOKLET_EN,
    build_quadrant_sequence_spec,
    render_quadrant_sequence_png_b64,
    tagalog_copy,
)

logger = logging.getLogger(__name__)

# Bump when the rendered figure format changes; stale DB rows are dropped and rebuilt on next GET /daily.
MATH_COGNITIVE_RENDER_VERSION = 6


def fallback_booklet_prompt_en(user_id: int, cal: date) -> str:
    opts = [
        "Three figures appear in order on top. Each step uses the same rule. Which choice A–E is the NEXT figure?",
        "Study the sequence in the top row. What should come next? Pick the answer that continues the pattern.",
        "The top shapes change from left to right following one rule. Select A–E for the next shape in the series.",
    ]
    h = int(hashlib.sha256(f"booklet|{user_id}|{cal.isoformat()}".encode()).hexdigest()[:8], 16)
    return opts[h % len(opts)]


def bonus_tip_three_digits_random() -> tuple[int, int, int]:
    """Three independent random digits 0–9 (cryptographic), new on every correct answer."""
    return secrets.randbelow(10), secrets.randbelow(10), secrets.randbelow(10)


def bonus_tip_three_digits(user_id: int, cal: date) -> tuple[int, int, int]:
    """Deterministic three digits (tests / legacy); prefer bonus_tip_three_digits_random in API."""
    h = hashlib.sha256(f"combo_tip3|{user_id}|{cal.isoformat()}".encode()).digest()
    return h[0] % 10, h[1] % 10, h[2] % 10


def bonus_tip_digit_pair(user_id: int, cal: date) -> tuple[int, int]:
    """Legacy two digits from deterministic triple."""
    a, b, _c = bonus_tip_three_digits(user_id, cal)
    return a, b


def generate_math_cognitive_puzzle(
    user_id: int, cal: date, settings: Settings
) -> tuple[str, str, str, str, str, str, int]:
    """
    Returns (image_b64, mime_type, expected_answer, tip_tagalog, title_tagalog, booklet_prompt_en, render_version).

    Figure is drawn locally (Pillow): three circles in sequence on top, rule line, five choices A–E (next pattern).
    No OpenAI Images — avoids DALL·E ignoring prompts and drawing number grids.
    `settings` is unused but kept for a stable call signature with the router.
    """
    _ = settings
    spec = build_quadrant_sequence_spec(user_id, cal)
    b64 = render_quadrant_sequence_png_b64(spec)
    title, tip = tagalog_copy(user_id, cal)
    logger.info(
        "math_cognitive: rendered programmatic puzzle user=%s date=%s answer=%s",
        user_id,
        cal,
        spec.answer_1_to_5,
    )
    return (
        b64,
        "image/png",
        str(spec.answer_1_to_5),
        tip,
        title,
        BOOKLET_EN,
        MATH_COGNITIVE_RENDER_VERSION,
    )


def normalize_numeric_guess(raw: str) -> str | None:
    s = raw.strip()
    if not s:
        return None
    if not re.fullmatch(r"[0-9]{1,3}", s):
        return None
    v = int(s, 10)
    if v > 999:
        return None
    return str(v)


def normalize_choice_guess(raw: str) -> str | None:
    """Accept 1–5 or letters A–E (figure-matrix style). Falls back to numeric for legacy puzzles."""
    s = raw.strip().upper()
    if len(s) == 1 and s in "ABCDE":
        return str(ord(s) - ord("A") + 1)
    return normalize_numeric_guess(raw)
