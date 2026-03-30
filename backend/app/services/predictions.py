"""Orchestrate free and premium predictions."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.config import get_settings
from app.ml.markov_model import predict_next_triple
from app.ml.miro import run_miro_swertres
from app.ml.xgboost_model import SwertresXGBoost
from app.models.draw import DrawSession
from app.models.prediction import PredictionRecord
from app.ml import council as council_mod

logger = logging.getLogger(__name__)

Triple = Tuple[int, int, int]


def _serialize_payload(data: Dict[str, Any]) -> str:
    return json.dumps(data, default=str)


def predict_free_for_session(db: Session, session: DrawSession) -> Dict[str, Any]:
    from app.services.draw_history import load_triples

    history = load_triples(db, session)
    disclaimers = (
        "Predictions are for entertainment only. Lottery draws are random. "
        "Past results do not determine future outcomes."
    )

    if len(history) < 10:
        t = predict_next_triple(history, seed=42)
        out = {
            "session": session.value,
            "models": {
                "XGBoost": {"digits": list(t), "note": "insufficient_history_used_markov"},
                "Markov": {"digits": list(t), "note": "short_history"},
            },
            "disclaimer": disclaimers,
        }
        return out

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
        "session": session.value,
        "models": {
            "XGBoost": {"digits": list(xgb_pick), "note": xgb_note},
            "Markov": {"digits": list(markov_pick), "note": "triple_transition_chain"},
        },
        "council_preview": council_mod.overlap_summary(
            {"XGBoost": list(xgb_pick), "Markov": list(markov_pick)}
        ),
        "disclaimer": disclaimers,
    }


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
