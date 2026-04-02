"""Atomic premium prediction credits (one credit ≈ one paid prediction)."""
from __future__ import annotations

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.user import User


def consume_one_premium_credit(db: Session, user_id: int) -> bool:
    """Decrement by 1 if balance >= 1. Commits on success. Returns True if a row was updated."""
    result = db.execute(
        update(User)
        .where(User.id == user_id, User.premium_credits >= 1)
        .values(premium_credits=User.premium_credits - 1)
    )
    ok = result.rowcount == 1
    if ok:
        db.commit()
    else:
        db.rollback()
    return ok


def refund_one_premium_credit(db: Session, user_id: int) -> None:
    """Restore one credit after a failed premium prediction."""
    db.execute(
        update(User)
        .where(User.id == user_id)
        .values(premium_credits=User.premium_credits + 1)
    )
    db.commit()
