"""Build analytics payloads from draws (sheet-backed) + stored prediction records."""
from __future__ import annotations

import json
import math
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
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


def _draw_query(db: Session, session: Optional[DrawSession], limit: int):
    q = db.query(Draw).order_by(Draw.draw_at.asc())
    if session is not None:
        q = q.filter(Draw.session == session)
    return q.limit(limit).all()


# Large cap so analytics reflects full sheet-backed history (same source as Google Sheet ingest).
_GAUSSIAN_MAX_DRAWS = 150_000
# Co-occurrence: scan up to this many recent draws (all sessions when session filter is off).
_COOCCURRENCE_MAX_DRAWS = 250_000


def _gaussian_points(db: Session, session: Optional[DrawSession], limit: int = _GAUSSIAN_MAX_DRAWS) -> List[Dict[str, float]]:
    rows = _draw_query(db, session, limit)
    out: List[Dict[str, float]] = []
    for r in rows:
        s = r.digit_1 + r.digit_2 + r.digit_3
        prod = max(r.digit_1 * r.digit_2 * r.digit_3, 1)
        out.append({"sum": float(s), "log_product": math.log(prod), "session": r.session.value})
    return out


def _mean_std(vals: List[float]) -> Tuple[float, float]:
    if not vals:
        return 0.0, 1.0
    m = sum(vals) / len(vals)
    if len(vals) < 2:
        return m, 1.0
    v = sum((x - m) ** 2 for x in vals) / (len(vals) - 1)
    return m, math.sqrt(max(v, 1e-12))


def _normal_pdf_scalar(x: float, mu: float, sigma: float) -> float:
    if sigma < 1e-9:
        sigma = 1e-9
    return math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * math.sqrt(2 * math.pi))


def build_gaussian_bundle(db: Session, session: Optional[DrawSession], limit: int = _GAUSSIAN_MAX_DRAWS) -> Dict[str, Any]:
    """1D normalization charts: digit sum and log(product) vs fitted normal (sheet-backed draws)."""
    pts = _gaussian_points(db, session, min(limit, _GAUSSIAN_MAX_DRAWS))
    n_total = len(pts)
    if n_total == 0:
        return {
            "draws_sampled": 0,
            "mean_sum": 0.0,
            "std_sum": 1.0,
            "mean_log_product": 0.0,
            "std_log_product": 1.0,
            "correlation": 0.0,
            "sum_histogram": [0] * 28,
            "sum_normal_curve": [{"x": float(i), "y": 0.0} for i in range(28)],
            "log_histogram": [0] * 24,
            "log_histogram_range": {"min": 0.0, "max": 1.0, "bins": 24},
            "log_normal_curve": [{"x": 0.0, "y": 0.0} for _ in range(24)],
            "gaussian_scatter": [],
        }

    sums = [p["sum"] for p in pts]
    logs = [p["log_product"] for p in pts]
    mu_x, std_x = _mean_std([float(s) for s in sums])
    mu_y, std_y = _mean_std([float(lp) for lp in logs])

    xs = np.array(sums, dtype=np.float64)
    ys = np.array(logs, dtype=np.float64)
    if n_total >= 2:
        cmat = np.cov(xs, ys, bias=False)
        if cmat.shape == (2, 2):
            c01 = float(cmat[0, 1])
            s0 = float(math.sqrt(max(cmat[0, 0], 1e-15)))
            s1 = float(math.sqrt(max(cmat[1, 1], 1e-15)))
            corr = c01 / (s0 * s1) if s0 * s1 > 1e-15 else 0.0
            corr = max(-1.0, min(1.0, corr))
        else:
            corr = 0.0
    else:
        corr = 0.0

    sum_hist = [0] * 28
    for s in sums:
        si = int(round(float(s)))
        if 0 <= si <= 27:
            sum_hist[si] += 1
    hist_max = max(sum_hist) or 1
    pdf_sum = [_normal_pdf_scalar(float(i), mu_x, std_x) for i in range(28)]
    pdf_max = max(pdf_sum) or 1e-12
    sum_curve_y = [p * hist_max / pdf_max for p in pdf_sum]
    sum_normal_curve = [{"x": float(i), "y": float(sum_curve_y[i])} for i in range(28)]

    n_log_bins = 24
    if logs:
        lo, hi = float(min(logs)), float(max(logs))
        if hi - lo < 1e-9:
            lo, hi = lo - 0.5, hi + 0.5
    else:
        lo, hi = 0.0, 1.0
    step = (hi - lo) / n_log_bins if hi > lo else 1.0
    log_hist = [0] * n_log_bins
    for lp in logs:
        b = int(min(n_log_bins - 1, max(0, (float(lp) - lo) / step)))
        log_hist[b] += 1
    log_hist_max = max(log_hist) or 1
    log_centers = [lo + (i + 0.5) * step for i in range(n_log_bins)]
    pdf_log = [_normal_pdf_scalar(c, mu_y, std_y) for c in log_centers]
    pdf_log_max = max(pdf_log) or 1e-12
    log_curve_y = [p * log_hist_max / pdf_log_max for p in pdf_log]
    log_normal_curve = [{"x": float(log_centers[i]), "y": float(log_curve_y[i])} for i in range(n_log_bins)]

    return {
        "draws_sampled": n_total,
        "mean_sum": float(mu_x),
        "std_sum": float(std_x),
        "mean_log_product": float(mu_y),
        "std_log_product": float(std_y),
        "correlation": float(corr),
        "sum_histogram": sum_hist,
        "sum_normal_curve": sum_normal_curve,
        "log_histogram": log_hist,
        "log_histogram_range": {"min": lo, "max": hi, "bins": n_log_bins},
        "log_normal_curve": log_normal_curve,
        "gaussian_scatter": [],
    }


def _cooccurrence_matrix(db: Session, session: Optional[DrawSession], limit: int = _COOCCURRENCE_MAX_DRAWS) -> List[List[int]]:
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


def _pairs_for_draw(ds: List[int]) -> List[Tuple[int, int]]:
    out: List[Tuple[int, int]] = []
    for i in range(3):
        for j in range(i + 1, 3):
            a, b = ds[i], ds[j]
            if a > b:
                a, b = b, a
            out.append((a, b))
    return out


def build_cooccurrence_graph(
    db: Session,
    session: Optional[DrawSession],
    limit_draws: int = _COOCCURRENCE_MAX_DRAWS,
    top_links: int = 80,
) -> Dict[str, Any]:
    q = db.query(Draw).order_by(Draw.draw_at.desc())
    if session is not None:
        q = q.filter(Draw.session == session)
    pair_counts: Dict[Tuple[int, int], int] = defaultdict(int)
    n = 0
    for r in q.limit(limit_draws).all():
        n += 1
        for a, b in _pairs_for_draw([r.digit_1, r.digit_2, r.digit_3]):
            pair_counts[(a, b)] += 1
    ranked = sorted(pair_counts.items(), key=lambda kv: -kv[1])[:top_links]
    links = [{"source": str(a), "target": str(b), "weight": w} for (a, b), w in ranked]
    nodes_set = set()
    for a, b in pair_counts:
        nodes_set.add(a)
        nodes_set.add(b)
    for (a, b), _ in ranked:
        nodes_set.add(a)
        nodes_set.add(b)
    nodes = [{"id": str(d)} for d in sorted(nodes_set)]
    available_pairs = len(pair_counts)
    return {
        "nodes": nodes,
        "links": links,
        "draws_sampled": n,
        "links_shown": len(links),
        "pair_types_available": available_pairs,
    }


def build_cross_draw_graph(
    db: Session,
    draw_session: DrawSession,
    limit_draws: int = 8000,
    top_links: int = 64,
) -> Dict[str, Any]:
    rows = (
        db.query(Draw)
        .filter(Draw.session == draw_session)
        .order_by(Draw.draw_at.asc())
        .limit(limit_draws)
        .all()
    )
    counts: Dict[Tuple[int, int], int] = defaultdict(int)
    for i in range(len(rows) - 1):
        da = [rows[i].digit_1, rows[i].digit_2, rows[i].digit_3]
        db_ = [rows[i + 1].digit_1, rows[i + 1].digit_2, rows[i + 1].digit_3]
        for x in da:
            for y in db_:
                counts[(x, y)] += 1
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])[:top_links]
    links = [{"source": str(a), "target": str(b), "weight": w} for (a, b), w in ranked]
    nodes_set: set[int] = set()
    for (a, b), _ in ranked:
        nodes_set.add(a)
        nodes_set.add(b)
    nodes = [{"id": str(d)} for d in sorted(nodes_set)]
    return {
        "nodes": nodes,
        "links": links,
        "session": draw_session.value,
        "draws_sampled": len(rows),
        "links_shown": len(links),
        "pair_types_in_data": len(counts),
    }


def _transition_edges_legacy(db: Session, session: DrawSession, limit: int = 1500) -> List[Dict[str, Any]]:
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


def _triple_from_models(models: dict, name: str) -> Optional[Tuple[int, int, int]]:
    block = models.get(name) or {}
    digits = block.get("digits")
    if not isinstance(digits, list) or len(digits) < 3:
        return None
    return (int(digits[0]), int(digits[1]), int(digits[2]))


def _miro_triple(data: dict) -> Optional[Tuple[int, int, int]]:
    m = data.get("miro")
    if not isinstance(m, dict):
        return None
    d = m.get("digits")
    if not isinstance(d, list) or len(d) < 3:
        return None
    return (int(d[0]), int(d[1]), int(d[2]))


def _iter_session_blocks(
    data: dict,
    tier: str,
) -> List[Tuple[str, dict, Optional[Tuple[int, int, int]]]]:
    """Yield (session_key, models_dict, miro_triple_or_none)."""
    miro = _miro_triple(data) if tier == "premium" else None
    out: List[Tuple[str, dict, Optional[Tuple[int, int, int]]]] = []
    sessions_block = data.get("sessions")
    if isinstance(sessions_block, dict):
        for sk, block in sessions_block.items():
            if sk not in ("9am", "4pm", "9pm"):
                continue
            if not isinstance(block, dict):
                continue
            models = block.get("models")
            if isinstance(models, dict) and "XGBoost" in models:
                out.append((sk, models, miro))
        return out
    sk = str(data.get("session") or "")
    models = data.get("models")
    if sk in ("9am", "4pm", "9pm") and isinstance(models, dict) and "XGBoost" in models:
        out.append((sk, models, miro))
    return out


def build_error_distance_series(db: Session, limit_records: int = 1200) -> List[Dict[str, Any]]:
    """Time-ordered Hamming distances: Alon (XGB + Markov), Lihim (Miro when premium), cognitive N/A."""
    records = (
        db.query(PredictionRecord)
        .order_by(PredictionRecord.created_at.asc())
        .limit(limit_records)
        .all()
    )
    session_map = {
        "9am": DrawSession.nine_am,
        "4pm": DrawSession.four_pm,
        "9pm": DrawSession.nine_pm,
    }
    points: List[Dict[str, Any]] = []
    for rec in records:
        try:
            data = json.loads(rec.model_output_json)
        except json.JSONDecodeError:
            continue
        tier = str(data.get("tier") or rec.tier or "free")
        for sess_key, models, miro_t in _iter_session_blocks(data, tier):
            draw_sess = session_map.get(sess_key)
            if draw_sess is None:
                continue
            xgb = _triple_from_models(models, "XGBoost")
            mk = _triple_from_models(models, "Markov")
            if xgb is None or mk is None:
                continue
            nxt = (
                db.query(Draw)
                .filter(Draw.session == draw_sess, Draw.draw_at > rec.created_at)
                .order_by(Draw.draw_at.asc())
                .first()
            )
            if not nxt:
                continue
            actual = (nxt.digit_1, nxt.digit_2, nxt.digit_3)
            miro_h = _hamming(miro_t, actual) if miro_t is not None else None
            points.append(
                {
                    "t": rec.created_at.isoformat(),
                    "session": sess_key,
                    "alon_xgb": _hamming(xgb, actual),
                    "alon_markov": _hamming(mk, actual),
                    "lihim_miro": miro_h,
                    "cognitive": None,
                }
            )
    return points


def build_dashboard(db: Session, session: Optional[str] = None) -> Dict[str, Any]:
    sess_enum: Optional[DrawSession] = None
    if session in ("9am", "4pm", "9pm"):
        sess_enum = DrawSession(session)

    reconcile_prediction_outcomes(db)

    gaussian = build_gaussian_bundle(db, sess_enum)
    cooc = _cooccurrence_matrix(db, sess_enum)
    cooc_graph = build_cooccurrence_graph(db, sess_enum)
    err_hist = _error_histogram(db)
    outcomes_n = db.query(PredictionOutcome).count()
    error_series = build_error_distance_series(db)
    if sess_enum is not None:
        error_series = [p for p in error_series if p.get("session") == sess_enum.value]

    if sess_enum is not None:
        cross_draw_graphs = {sess_enum.value: build_cross_draw_graph(db, sess_enum)}
    else:
        cross_draw_graphs = {
            "9am": build_cross_draw_graph(db, DrawSession.nine_am),
            "4pm": build_cross_draw_graph(db, DrawSession.four_pm),
            "9pm": build_cross_draw_graph(db, DrawSession.nine_pm),
        }

    transitions_9am = _transition_edges_legacy(db, DrawSession.nine_am)
    transitions_4pm = _transition_edges_legacy(db, DrawSession.four_pm)
    transitions_9pm = _transition_edges_legacy(db, DrawSession.nine_pm)

    return {
        "gaussian_scatter": gaussian["gaussian_scatter"],
        "gaussian": gaussian,
        "cooccurrence_matrix": cooc,
        "cooccurrence_graph": cooc_graph,
        "cross_draw_graphs": cross_draw_graphs,
        "error_histogram": err_hist,
        "error_series": error_series,
        "outcome_rows": outcomes_n,
        "transitions": {"9am": transitions_9am, "4pm": transitions_4pm, "9pm": transitions_9pm},
    }
