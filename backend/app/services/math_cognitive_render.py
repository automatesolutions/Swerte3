"""Programmatic cognitive-style figures: quadrant-circle sequences (next pattern)."""
from __future__ import annotations

import base64
import hashlib
import random
from dataclasses import dataclass
from datetime import date
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

# Quadrant bits: TL=1, TR=2, BR=4, BL=8 — PIL pieslice angles (3 o'clock origin, clockwise)
_QUAD_ANGLES: tuple[tuple[int, int], ...] = (
    (180, 270),  # top-left
    (270, 360),  # top-right
    (0, 90),  # bottom-right
    (90, 180),  # bottom-left
)


def _rng(user_id: int, cal: date) -> random.Random:
    digest = hashlib.sha256(f"math_cog_v3_seq|{user_id}|{cal.isoformat()}".encode()).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def _try_font(size: int) -> ImageFont.ImageFont:
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def rotate_quadrants_cw(m: int) -> int:
    """Rotate filled quadrants 90° clockwise (TL←BL, TR←TL, BR←TR, BL←BR)."""
    tl = 1 if m & 1 else 0
    tr = 1 if m & 2 else 0
    br = 1 if m & 4 else 0
    bl = 1 if m & 8 else 0
    ntl = bl
    ntr = tl
    nbr = tr
    nbl = br
    return ntl | (ntr << 1) | (nbr << 2) | (nbl << 3)


def invert_mask(m: int) -> int:
    return m ^ 15


def _draw_circle_quadrants(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    r: float,
    mask: int,
    *,
    line_w: int,
) -> None:
    bbox = (cx - r, cy - r, cx + r, cy + r)
    for i in range(4):
        if mask & (1 << i):
            a0, a1 = _QUAD_ANGLES[i]
            draw.pieslice(bbox, a0, a1, fill="black", outline="black")
    draw.line((cx, cy - r, cx, cy + r), fill="black", width=line_w)
    draw.line((cx - r, cy, cx + r, cy), fill="black", width=line_w)
    draw.ellipse(bbox, outline="black", width=line_w)


@dataclass(frozen=True)
class QuadrantSequenceSpec:
    """Three figures in order on top; pick A–E for the next in the same rule."""

    sequence_masks: tuple[int, int, int]
    choice_masks: tuple[int, int, int, int, int]
    answer_1_to_5: int


def build_quadrant_sequence_spec(user_id: int, cal: date) -> QuadrantSequenceSpec:
    """
    Build a deterministic sequence puzzle:
    - Rule A: repeat 90° CW rotation each step.
    - Rule B: alternate with full quadrant inversion (m, 15^m, m, …).
    - Rule C: 180° rotation (two CW steps) alternating with identity on the third shown cell.
    """
    rng = _rng(user_id, cal)
    pool = [m for m in range(1, 15) if m != 15]
    answer_pos = rng.randint(1, 5)
    rule = rng.randint(0, 2)

    if rule == 0:
        m0 = rng.choice(pool)
        m1 = rotate_quadrants_cw(m0)
        m2 = rotate_quadrants_cw(m1)
        target = rotate_quadrants_cw(m2)
        seq = (m0, m1, m2)
    elif rule == 1:
        candidates = [x for x in pool if invert_mask(x) != x and invert_mask(x) in pool]
        if not candidates:
            candidates = pool
        m0 = rng.choice(candidates)
        m1 = invert_mask(m0)
        # Shown: m0 → inverted → m0; next repeats: inverted again (= m1).
        target = m1
        seq = (m0, m1, m0)
    else:
        m0 = rng.choice(pool)
        r2 = lambda x: rotate_quadrants_cw(rotate_quadrants_cw(x))
        m1 = r2(m0)
        # Shown: m0 → 180° → m0; next step repeats: back to 180° view (= m1).
        target = m1
        seq = (m0, m1, m0)

    choices: list[int] = []
    for i in range(1, 6):
        if i == answer_pos:
            choices.append(target)
            continue
        wrong_opts = [m for m in pool if m != target]
        choices.append(rng.choice(wrong_opts))

    return QuadrantSequenceSpec(
        sequence_masks=seq,
        choice_masks=tuple(choices),
        answer_1_to_5=answer_pos,
    )


def render_quadrant_sequence_png_b64(spec: QuadrantSequenceSpec) -> str:
    w, h = 900, 760
    img = Image.new("RGB", (w, h), "white")
    draw = ImageDraw.Draw(img)
    font_label = _try_font(24)
    font_next = _try_font(28)
    line_w = 3

    y_top = 100
    r_big = 72
    gap_big = 48
    total_w = 3 * (2 * r_big) + 2 * gap_big
    x0 = (w - total_w) / 2 + r_big
    for i, mask in enumerate(spec.sequence_masks):
        cx = x0 + i * (2 * r_big + gap_big)
        _draw_circle_quadrants(draw, cx, y_top, r_big, mask, line_w=line_w)

    y_line = y_top + r_big + 28
    draw.line((48, y_line, w - 48, y_line), fill="black", width=4)

    r_sm = 48
    # Prompt sits in its own band between the rule line and the A–E row (no overlap with circles).
    q = "NEXT ?"
    qb = draw.textbbox((0, 0), q, font=font_next)
    qw = qb[2] - qb[0]
    qh = qb[3] - qb[1]
    y_next = y_line + 10
    draw.text(((w - qw) / 2, y_next), q, fill="#0f172a", font=font_next)
    gap_after_next = 18
    y_bot = y_next + qh + gap_after_next + r_sm
    gap_sm = 28
    total_c = 5 * (2 * r_sm) + 4 * gap_sm
    xc0 = (w - total_c) / 2 + r_sm
    labels = ("A", "B", "C", "D", "E")
    for i, mask in enumerate(spec.choice_masks):
        cx = xc0 + i * (2 * r_sm + gap_sm)
        _draw_circle_quadrants(draw, cx, y_bot, r_sm, mask, line_w=2)
        ch = labels[i]
        bbox = draw.textbbox((0, 0), ch, font=font_label)
        tw = bbox[2] - bbox[0]
        draw.text((cx - tw / 2, y_bot + r_sm + 12), ch, fill="black", font=font_label)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


BOOKLET_EN = (
    "The top row shows three figures in order. Each step follows the same hidden rule. "
    "Which answer A–E shows the NEXT figure that continues the sequence?"
)

TITLES_TL = (
    "Ano ang susunod na pattern?",
    "Sundan ang takbo ng hugis",
    "Alin ang kasunod sa hanay?",
    "Sunod na hugis sa cognitive challenge",
)

TIPS_TL = (
    "Tingnan ang tatlong bilog nang sunud-sunod — may iisang patakaran bawat hakbang.",
    "Ikumpara ang unang pangalawa at pangatlo: ano ang nagbabago sa itim na bahagi?",
    "Ang sagot ay ang hugis na magpapatuloy sa eksaktong ugali ng sequence.",
    "Minsan umiikot ang itim, minsan baligtad — hanapin ang susunod na hakbang.",
)


def tagalog_copy(user_id: int, cal: date) -> tuple[str, str]:
    """(title_tagalog, tip_tagalog) — separate seeds from puzzle RNG so streams do not clash."""
    seed_t = int.from_bytes(hashlib.sha256(f"math_cog_title|{user_id}|{cal}".encode()).digest()[:8], "big")
    seed_p = int.from_bytes(hashlib.sha256(f"math_cog_tip|{user_id}|{cal}".encode()).digest()[:8], "big")
    return random.Random(seed_t).choice(TITLES_TL), random.Random(seed_p).choice(TIPS_TL)
