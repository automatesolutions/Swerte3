"""FastAPI dependencies."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.jwt_service import verify_access_token


def get_bearer_token(authorization: Annotated[Optional[str], Header()] = None) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip()


def get_current_user_optional(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(get_bearer_token),
) -> Optional[User]:
    if not token:
        return None
    sub = verify_access_token(token)
    if not sub:
        return None
    try:
        uid = int(sub)
    except ValueError:
        return None
    return db.query(User).filter(User.id == uid, User.is_active.is_(True)).first()


def get_current_user(
    user: Annotated[Optional[User], Depends(get_current_user_optional)],
) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def require_premium(user: User) -> User:
    pu = user.premium_until
    if not pu or pu <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Premium subscription required",
        )
    return user
