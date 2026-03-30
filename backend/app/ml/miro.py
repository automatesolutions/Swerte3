"""Miro-style two-round LLM merge for Swertres."""
from __future__ import annotations

import json
import logging
from collections import Counter
from typing import Any, Dict, List, Optional

from app.config import SWERTRES_DIGIT_MAX, SWERTRES_DIGIT_MIN
from app.ml import council as council_mod
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)


def _validate_triple(nums: Any) -> Optional[List[int]]:
    if not isinstance(nums, list) or len(nums) != 3:
        return None
    out: List[int] = []
    for x in nums:
        try:
            v = int(x)
        except (TypeError, ValueError):
            return None
        if v < SWERTRES_DIGIT_MIN or v > SWERTRES_DIGIT_MAX:
            return None
        out.append(v)
    return out


def _fallback_from_models(models: Dict[str, Any]) -> List[int]:
    counts: Counter = Counter()
    for m in models.values():
        if isinstance(m, dict):
            d = m.get("digits")
            if isinstance(d, list) and len(d) == 3:
                for x in d:
                    try:
                        v = int(x)
                        if 0 <= v <= 9:
                            counts[v] += 1
                    except (TypeError, ValueError):
                        continue
    if not counts:
        return [0, 0, 0]
    most = [n for n, _ in counts.most_common()]
    while len(most) < 3:
        most.append(most[-1] if most else 0)
    return most[:3]


def build_miro_context(session_value: str, models: Dict[str, Any]) -> Dict[str, Any]:
    preds = {}
    for name, payload in models.items():
        if isinstance(payload, dict) and "digits" in payload:
            preds[name] = payload["digits"]
    return {
        "session": session_value,
        "game_rules": {
            "name": "Swertres / 3D",
            "digits": 3,
            "min_digit": SWERTRES_DIGIT_MIN,
            "max_digit": SWERTRES_DIGIT_MAX,
            "repeats_allowed": True,
        },
        "base_predictions": preds,
        "overlap": council_mod.overlap_summary({k: list(v) for k, v in preds.items()}),
    }


def run_miro_swertres(session_value: str, models: Dict[str, Any]) -> List[int]:
    ctx = build_miro_context(session_value, models)
    llm = LLMClient()
    agent_system = (
        "You simulate three specialists named XGBoost, MarkovChain, Analyst tied to prior JSON only. "
        "Swertres triple: three digits 0-9, repeats allowed. No winning guarantees. "
        "Output JSON {\"agents\": [3 objects]} each {\"model\": string, \"reaction\": string, "
        "\"candidate_triple\": [d1,d2,d3] }."
    )
    agents_json = llm.chat_json(
        [
            {"role": "system", "content": agent_system},
            {"role": "user", "content": json.dumps(ctx, default=str)},
        ],
        temperature=0.35,
        max_tokens=900,
    )

    chair_system = (
        "Chairman: output JSON {\"final_digits\": [d1,d2,d3]} only, digits 0-9, repeats allowed, "
        "advisory lottery pick. JSON only."
    )
    final_json = llm.chat_json(
        [
            {"role": "system", "content": chair_system},
            {
                "role": "user",
                "content": json.dumps({"analytics": ctx, "agents": agents_json.get("agents")}, default=str),
            },
        ],
        temperature=0.2,
        max_tokens=400,
    )

    nums = _validate_triple(final_json.get("final_digits"))
    if nums is not None:
        return nums

    repair = llm.chat_json(
        [
            {"role": "system", "content": "Output only {\"final_digits\": [d1,d2,d3]} with digits 0-9."},
            {"role": "user", "content": json.dumps({"bad": final_json})},
        ],
        temperature=0.1,
        max_tokens=200,
    )
    nums2 = _validate_triple(repair.get("final_digits"))
    if nums2 is not None:
        return nums2

    fb = _fallback_from_models(models)
    logger.warning("Miro Swertres using vote fallback")
    return fb
