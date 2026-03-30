"""Feature builder for Swertres sequences."""
from __future__ import annotations

from typing import List, Sequence, Tuple

import numpy as np

def triple_to_vec(t: Tuple[int, int, int]) -> np.ndarray:
    return np.array(t, dtype=np.float32)


def build_supervised_pairs(
    history: Sequence[Tuple[int, int, int]],
    lookback: int = 5,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    X[i] = flattened previous `lookback` triples (3*lookback dims, zero-padded if early).
    y[i] = next triple (3 dims).
    """
    h = [tuple(int(x) for x in t) for t in history]
    if len(h) < lookback + 1:
        return np.array([]), np.array([])

    dim = 3 * lookback
    xs: List[np.ndarray] = []
    ys: List[np.ndarray] = []
    for i in range(lookback, len(h)):
        window = h[i - lookback : i]
        flat: List[float] = []
        for trip in window:
            flat.extend(trip)
        assert len(flat) == dim
        xs.append(np.array(flat, dtype=np.float32))
        ys.append(np.array(h[i], dtype=np.int32))
    if not xs:
        return np.array([]), np.array([])
    return np.stack(xs), np.stack(ys)
