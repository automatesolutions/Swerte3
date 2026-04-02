"""Orchestrate free and premium predictions."""
from __future__ import annotations

import json
import logging
import hashlib
from datetime import date as date_cls, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.config import get_settings
from app.ml.markov_model import predict_next_triple
from app.ml.miro import run_miro_swertres
from app.ml.xgboost_model import SwertresXGBoost
from app.models.draw import DrawSession
from app.models.prediction import PredictionRecord
from app.ml import council as council_mod
from app.services.draw_history import load_triples, load_triples_until
from app.services.sheets_ingest import run_full_ingest

logger = logging.getLogger(__name__)

Triple = Tuple[int, int, int]


def _serialize_payload(data: Dict[str, Any]) -> str:
    return json.dumps(data, default=str)


def _int_from_key(key: str) -> int:
    return int(hashlib.sha256(key.encode()).hexdigest()[:12], 16)


def _vary_digits(base: List[int], key: str) -> List[int]:
    v = _int_from_key(key)
    offsets = [
        (v % 7) % 10,
        ((v // 7) % 7) % 10,
        ((v // 49) % 7) % 10,
    ]
    return [int((d + offsets[idx]) % 10) for idx, d in enumerate(base[:3])]


def _predict_models_from_history(history: List[Triple]) -> Dict[str, Dict[str, Any]]:
    if len(history) < 10:
        t = predict_next_triple(history, seed=42)
        return {
            "XGBoost": {"digits": list(t), "note": "insufficient_history_used_markov"},
            "Markov": {"digits": list(t), "note": "short_history"},
        }

    xgb = SwertresXGBoost()
    xgb_ok = xgb.fit(history)
    xgb_pick: Optional[Triple] = xgb.predict_next(history) if xgb_ok else None
    if xgb_pick is None:
        xgb_pick = predict_next_triple(history, seed=7)
        xgb_note = "training_or_predict_failed_markov_substitute"
    else:
        xgb_note = "xgboost"

    markov_pick = predict_next_triple(history, seed=11)
    return {
        "XGBoost": {"digits": list(xgb_pick), "note": xgb_note},
        "Markov": {"digits": list(markov_pick), "note": "triple_transition_chain"},
    }


def predict_free_for_session(db: Session, session: DrawSession) -> Dict[str, Any]:
    history = load_triples(db, session)
    disclaimers = (
        "Predictions are for entertainment only. Lottery draws are random. "
        "Past results do not determine future outcomes."
    )
    models = _predict_models_from_history(history)
    xgb_digits = models["XGBoost"]["digits"]
    markov_digits = models["Markov"]["digits"]

    return {
        "session": session.value,
        "models": models,
        "council_preview": council_mod.overlap_summary(
            {"XGBoost": list(xgb_digits), "Markov": list(markov_digits)}
        ),
        "disclaimer": disclaimers,
    }


def predict_free_for_date_all_sessions(
    db: Session,
    target_date: date_cls,
    variation_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Predict all sessions using history up to the selected date."""
    ingest_meta: Dict[str, Any] = {"inserted": 0, "skipped": 0, "errors": None}
    try:
        run = run_full_ingest(db)
        ingest_meta = {"inserted": run.rows_inserted, "skipped": run.rows_updated, "errors": run.errors}
    except Exception:
        logger.warning("Sheet ingest failed before daily prediction", exc_info=True)
        ingest_meta = {"inserted": 0, "skipped": 0, "errors": "Ingest failed before prediction."}

    end_of_day_utc = datetime(
        target_date.year,
        target_date.month,
        target_date.day,
        23,
        59,
        59,
        tzinfo=timezone.utc,
    ) + timedelta(microseconds=999999)
    disclaimers = (
        "Predictions are for entertainment only. Lottery draws are random. "
        "Past results do not determine future outcomes."
    )

    sessions = [DrawSession.nine_am, DrawSession.four_pm, DrawSession.nine_pm]
    out: Dict[str, Any] = {
        "date": target_date.isoformat(),
        "sessions": {},
        "disclaimer": disclaimers,
        "ingestion": ingest_meta,
    }
    for session in sessions:
        history = load_triples_until(db, session, end_of_day_utc)
        models = _predict_models_from_history(history)
        if variation_key:
            # Keep date as a deterministic influence while still allowing per-press variation.
            base_salt = f"{target_date.isoformat()}|{session.value}|{variation_key}|{len(history)}"
            models["XGBoost"]["digits"] = _vary_digits(models["XGBoost"]["digits"], f"xgb|{base_salt}")
            models["Markov"]["digits"] = _vary_digits(models["Markov"]["digits"], f"mkv|{base_salt}")
            models["XGBoost"]["note"] = f'{models["XGBoost"].get("note", "")}|date_variation'
            models["Markov"]["note"] = f'{models["Markov"].get("note", "")}|date_variation'
        out["sessions"][session.value] = {
            "session": session.value,
            "models": models,
            "history_count": len(history),
            "source": "google-sheet-history",
        }
    if all(v.get("history_count", 0) == 0 for v in out["sessions"].values()):
        out["warning"] = (
            "No history rows were loaded from Google Sheets. Check sheet tab names/columns and backend ingest settings."
        )
    return out


def predict_premium_for_session(
    db: Session,
    user_id: Optional[int],
    session: DrawSession,
) -> Dict[str, Any]:
    base = predict_free_for_session(db, session)
    settings = get_settings()
    preds_for_miro = {
        "XGBoost": {"numbers": base["models"]["XGBoost"]["digits"]},
        "MarkovChain": {"numbers": base["models"]["Markov"]["digits"]},
    }
    miro_digits: List[int] = []
    miro_err: Optional[str] = None
    council_report: Dict[str, Any] = {}
    if settings.llm_api_key:
        try:
            miro_digits = run_miro_swertres(session.value, base["models"])
        except Exception as e:
            logger.exception("Miro failed")
            miro_err = str(e)
        try:
            council_report = council_mod.run_swarm_summary(session.value, preds_for_miro)
        except Exception as e:
            logger.warning("Council summary failed: %s", e)
            council_report = {"error": str(e)}
    else:
        miro_err = "LLM_API_KEY is not configured"

    premium = {
        **base,
        "tier": "premium",
        "miro": {"digits": miro_digits} if miro_digits else {"error": miro_err},
        "council": council_report,
    }
    rec = PredictionRecord(
        user_id=user_id,
        session=session.value,
        tier="premium",
        model_output_json=_serialize_payload(premium),
    )
    db.add(rec)
    db.commit()
    return premium


def log_free_prediction(db: Session, payload: Dict[str, Any], user_id: Optional[int] = None) -> None:
    rec = PredictionRecord(
        user_id=user_id,
        session=payload.get("session", ""),
        tier="free",
        model_output_json=_serialize_payload(payload),
    )
    db.add(rec)
    db.commit()
