"""XGBoost multi-output digit predictors for Swertres."""
from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

import numpy as np
import xgboost as xgb
from sklearn.multioutput import MultiOutputClassifier

from app.config import XGBOOST_PARAMS
from app.ml.features import build_supervised_pairs

Triple = Tuple[int, int, int]


class SwertresXGBoost:
    def __init__(self):
        self.model: Optional[MultiOutputClassifier] = None
        self.lookback = 5

    def fit(self, history: Sequence[Triple]) -> bool:
        X, y = build_supervised_pairs(history, lookback=self.lookback)
        if len(X) < 8:
            return False
        base = xgb.XGBClassifier(**XGBOOST_PARAMS)
        self.model = MultiOutputClassifier(base)
        self.model.fit(X, y)
        return True

    def predict_next(self, history: Sequence[Triple]) -> Optional[Triple]:
        if self.model is None:
            return None
        h = [tuple(int(x) for x in t) for t in history]
        if len(h) < self.lookback:
            return None
        window = h[-self.lookback :]
        flat = []
        for t in window:
            flat.extend(t)
        X = np.array([flat], dtype=np.float32)
        pred = self.model.predict(X)[0]
        out = tuple(int(min(9, max(0, round(float(v))))) for v in pred)
        return out[0], out[1], out[2]


def train_or_fallback(history: List[Triple], seed: Optional[int] = None) -> Tuple[Triple, str]:
    """Returns (triple, model_note)."""
    m = SwertresXGBoost()
    if m.fit(history):
        p = m.predict_next(history)
        if p:
            return p, "xgboost"
    from app.ml.markov_model import predict_next_triple

    return predict_next_triple(history, seed=seed), "markov_fallback"
