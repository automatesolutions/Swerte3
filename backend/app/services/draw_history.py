"""Load ordered draw history from DB."""
from __future__ import annotations

from typing import List, Tuple

from sqlalchemy.orm import Session

from app.models.draw import Draw, DrawSession


def load_triples(db: Session, session: DrawSession, limit: int = 8000) -> List[Tuple[int, int, int]]:
    rows = (
        db.query(Draw)
        .filter(Draw.session == session)
        .order_by(Draw.draw_at.asc())
        .limit(limit)
        .all()
    )
    return [(r.digit_1, r.digit_2, r.digit_3) for r in rows]
