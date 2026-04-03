"""LLM swarm / council summaries for premium tier (Swertres)."""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List

from app.services.llm_client import LLMClient, safe_json_dumps_for_llm


def multiset_jaccard(a: List[int], b: List[int]) -> float:
    ca, cb = Counter(a), Counter(b)
    inter = sum((ca & cb).values())
    union = sum((ca | cb).values())
    return round(inter / union, 4) if union else 0.0


def overlap_summary(predictions: Dict[str, List[int]]) -> Dict[str, Any]:
    names = list(predictions.keys())
    pairs = []
    for i, n1 in enumerate(names):
        for n2 in names[i + 1 :]:
            pairs.append(
                {
                    "model_a": n1,
                    "model_b": n2,
                    "jaccard_multiset": multiset_jaccard(predictions[n1], predictions[n2]),
                }
            )
    digit_votes: Counter = Counter()
    for nums in predictions.values():
        digit_votes.update(nums)
    return {
        "pairs": sorted(pairs, key=lambda x: -x["jaccard_multiset"]),
        "digit_vote_histogram": dict(digit_votes.most_common()),
    }


def run_swarm_summary(session: str, preds_for_miro: Dict[str, Any]) -> Dict[str, Any]:
    """
    Single structured LLM pass: six specialist personas adapted to Swertres (3 digits).
    preds_for_miro values shaped like {"numbers": [d1,d2,d3]}.
    """
    ctx = {
        "draw_session": session,
        "base_models": preds_for_miro,
        "overlap": overlap_summary(
            {k: list(v.get("numbers", [])) for k, v in preds_for_miro.items() if isinstance(v, dict)}
        ),
    }
    llm = LLMClient()
    system = (
        "You simulate six analysts: XGBoost, DecisionTree, MarkovChain, AnomalyDetection, "
        "NashHotFilter, DRL. They only react to shared JSON context. "
        "Swertres uses three digits 0-9 per draw; repeats allowed. "
        "Never claim improved odds. Output JSON {\"agents\": [..6 objects..]} each object: "
        "{\"model\": name, \"reaction\": string, \"preferred_digits\": int[0-9] length<=6 optional}. "
        "Order must match the six names listed."
    )
    agents_json = llm.chat_json(
        [{"role": "system", "content": system}, {"role": "user", "content": safe_json_dumps_for_llm(ctx)}],
        temperature=0.35,
        max_tokens=1400,
    )

    chair = (
        "Chairman: merge views into JSON {\"summary\": string, \"suggested_triple\": [d1,d2,d3] } "
        "Digits 0-9 each, repeats allowed. Advisory only."
    )
    final = llm.chat_json(
        [
            {"role": "system", "content": chair},
            {"role": "user", "content": safe_json_dumps_for_llm({"context": ctx, "agents": agents_json})},
        ],
        temperature=0.25,
        max_tokens=500,
    )
    return {"agents_round": agents_json, "chair_round": final, "context": ctx}
