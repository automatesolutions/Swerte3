"""Triple-level Markov transitions for Swertres."""
from __future__ import annotations

import random
from collections import Counter, defaultdict
from typing import Dict, List, Optional, Sequence, Tuple

Triple = Tuple[int, int, int]


def _key(t: Triple) -> str:
    return f"{t[0]}{t[1]}{t[2]}"


def _from_key(k: str) -> Triple:
    return int(k[0]), int(k[1]), int(k[2])


def build_transition_counts(history: Sequence[Triple]) -> Dict[str, Counter]:
    """Count next-triple frequencies following each triple."""
    trans: Dict[str, Counter] = defaultdict(Counter)
    for i in range(len(history) - 1):
        a = _key(tuple(int(x) for x in history[i]))
        nxt = history[i + 1]
        b = tuple(min(9, max(0, int(x))) for x in nxt)
        trans[a][_key(b)] += 1
    return trans


def predict_next_triple(history: Sequence[Triple], seed: Optional[int] = None) -> Triple:
    """Sample next triple from transition counts; fallback to global marginal."""
    if len(history) < 2:
        rng = random.Random(seed)
        return rng.randint(0, 9), rng.randint(0, 9), rng.randint(0, 9)

    counts = build_transition_counts(history)
    last = _key(tuple(int(x) for x in history[-1]))
    nxt = counts.get(last)
    rng = random.Random(seed)

    if not nxt:
        flat: List[int] = []
        for t in history:
            flat.extend(t)
        c = Counter(flat)
        if not c:
            return rng.randint(0, 9), rng.randint(0, 9), rng.randint(0, 9)
        d1 = c.most_common(1)[0][0]
        d2 = rng.randint(0, 9)
        d3 = rng.randint(0, 9)
        return min(9, max(0, d1)), d2, d3

    choices, weights = zip(*nxt.items())
    chosen = rng.choices(choices, weights=weights, k=1)[0]
    return _from_key(chosen)
