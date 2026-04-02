"""Build analytics payloads from draws + stored prediction outcomes."""
from __future__ import annotations

import json
import math
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.draw import Draw, DrawSession
from app.models.prediction import PredictionRecord
from app.models.prediction_outcome import PredictionOutcome


def _hamming(p: Tuple[int, int, int], a: Tuple[int, int, int]) -> int:
    return sum(1 for i in range(3) if p[i] != a[i])


def reconcile_prediction_outcomes(db: Session, limit_records: int = 300) -> int:
    """Match recent multi-session prediction logs to the next actual draw per session. Returns new rows inserted."""
    inserted = 0
    records = (
        db.query(PredictionRecord)
        .filter(PredictionRecord.tier == "free")
        .order_by(PredictionRecord.id.desc())
        .limit(limit_records)
        .all()
    )
    session_map = {
        "9am": DrawSession.nine_am,
        "4pm": DrawSession.four_pm,
        "9pm": DrawSession.nine_pm,
    }
    for rec in records:
        try:
            data = json.loads(rec.model_output_json)
        except json.JSONDecodeError:
            continue
        sessions_block = data.get("sessions")
        if not isinstance(sessions_block, dict):
            continue
        for sess_key, draw_sess in session_map.items():
            if sess_key not in sessions_block:
                continue
            exists = (
                db.query(PredictionOutcome)
                .filter(
                    PredictionOutcome.prediction_record_id == rec.id,
                    PredictionOutcome.session == sess_key,
                )
                .first()
            )
            if exists:
                continue
            block = sessions_block.get(sess_key) or {}
            models = block.get("models") or {}
            xgb = models.get("XGBoost") or {}
            digits = xgb.get("digits")
            if not isinstance(digits, list) or len(digits) < 3:
                continue
            p = (int(digits[0]), int(digits[1]), int(digits[2]))
            nxt = (
                db.query(Draw)
                .filter(Draw.session == draw_sess, Draw.draw_at > rec.created_at)
                .order_by(Draw.draw_at.asc())
                .first()
            )
            if not nxt:
                continue
            actual = (nxt.digit_1, nxt.digit_2, nxt.digit_3)
            h = _hamming(p, actual)
            db.add(
                PredictionOutcome(
                    prediction_record_id=rec.id,
                    session=sess_key,
                    draw_id=nxt.id,
                    hamming=h,
                    predicted_digit_1=p[0],
                    predicted_digit_2=p[1],
                    predicted_digit_3=p[2],
                    actual_digit_1=actual[0],
                    actual_digit_2=actual[1],
                    actual_digit_3=actual[2],
                )
            )
            inserted += 1
    try:
        if inserted:
            db.commit()
    except Exception:
        db.rollback()
        raise
    return inserted


def _gaussian_points(db: Session, session: Optional[DrawSession], limit: int = 2000) -> List[Dict[str, float]]:
    q = db.query(Draw).order_by(Draw.draw_at.asc())
    if session is not None:
        q = q.filter(Draw.session == session)
    rows = q.limit(limit).all()
    out: List[Dict[str, float]] = []
    for r in rows:
        s = r.digit_1 + r.digit_2 + r.digit_3
        prod = max(r.digit_1 * r.digit_2 * r.digit_3, 1)
        out.append({"sum": float(s), "log_product": math.log(prod), "session": r.session.value})
    return out


def _cooccurrence_matrix(db: Session, session: Optional[DrawSession], limit: int = 5000) -> List[List[int]]:
    mat = [[0 for _ in range(10)] for _ in range(10)]
    q = db.query(Draw).order_by(Draw.draw_at.desc())
    if session is not None:
        q = q.filter(Draw.session == session)
    for r in q.limit(limit).all():
        ds = [r.digit_1, r.digit_2, r.digit_3]
        for i in range(3):
            for j in range(i + 1, 3):
                a, b = ds[i], ds[j]
                mat[a][b] += 1
                mat[b][a] += 1
    return mat


def _transition_edges(db: Session, session: DrawSession, limit: int = 1500) -> List[Dict[str, Any]]:
    rows = (
        db.query(Draw)
        .filter(Draw.session == session)
        .order_by(Draw.draw_at.asc())
        .limit(limit)
        .all()
    )
    counts: Dict[Tuple[str, str], int] = defaultdict(int)
    for i in range(len(rows) - 1):
        a = rows[i]
        b = rows[i + 1]
        fa = f"{a.digit_1}{a.digit_2}{a.digit_3}"
        tb = f"{b.digit_1}{b.digit_2}{b.digit_3}"
        counts[(fa, tb)] += 1
    edges = [{"from": k[0], "to": k[1], "weight": v} for k, v in counts.items()]
    edges.sort(key=lambda e: -e["weight"])
    return edges[:80]


def _error_histogram(db: Session) -> Dict[str, int]:
    rows = db.query(PredictionOutcome.hamming).all()
    hist = {"0": 0, "1": 0, "2": 0, "3": 0}
    for (h,) in rows:
        key = str(int(h))
        if key in hist:
            hist[key] += 1
    return hist


def build_dashboard(db: Session, session: Optional[str] = None) -> Dict[str, Any]:
    sess_enum: Optional[DrawSession] = None
    if session in ("9am", "4pm", "9pm"):
        sess_enum = DrawSession(session)

    reconcile_prediction_outcomes(db)

    gauss = _gaussian_points(db, sess_enum)
    cooc = _cooccurrence_matrix(db, sess_enum)
    transitions_9am = _transition_edges(db, DrawSession.nine_am)
    transitions_4pm = _transition_edges(db, DrawSession.four_pm)
    transitions_9pm = _transition_edges(db, DrawSession.nine_pm)
    err_hist = _error_histogram(db)
    outcomes_n = db.query(PredictionOutcome).count()

    return {
        "gaussian_scatter": gauss[-800:],  # trim payload
        "cooccurrence_matrix": cooc,
        "transitions": {"9am": transitions_9am, "4pm": transitions_4pm, "9pm": transitions_9pm},
        "error_histogram": err_hist,
        "outcome_rows": outcomes_n,
    }
