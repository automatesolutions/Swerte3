"""FastAPI dependencies."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.jwt_service import verify_access_token

# auto_error=False: optional auth for /predict/free; OpenAPI shows a single "Authorize" JWT scheme.
_http_bearer_optional = HTTPBearer(auto_error=False)


def get_bearer_token(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(_http_bearer_optional),
    ],
) -> Optional[str]:
    if credentials is None:
        return None
    return credentials.credentials.strip()


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


# Shared "anonymous app" user for Litrato / Cognitive when no JWT is sent (OTP removed from client).
ANONYMOUS_TIPS_PHONE_E164 = "+630000000000"


def get_user_for_daily_tips(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(get_bearer_token),
) -> User:
    """Use JWT user when provided; otherwise a stable anonymous User row (one shared puzzle per device day)."""
    if token:
        sub = verify_access_token(token)
        if sub:
            try:
                uid = int(sub)
            except ValueError:
                uid = None
            else:
                u = db.query(User).filter(User.id == uid, User.is_active.is_(True)).first()
                if u:
                    return u
    phone = ANONYMOUS_TIPS_PHONE_E164
    u = db.query(User).filter(User.phone_e164 == phone).first()
    if u:
        return u
    u = User(phone_e164=phone, premium_credits=0)
    db.add(u)
    try:
        db.commit()
        db.refresh(u)
        return u
    except IntegrityError:
        db.rollback()
        u = db.query(User).filter(User.phone_e164 == phone).first()
        if not u:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not resolve anonymous user",
            ) from None
        return u


def require_premium(user: User) -> User:
    if (user.premium_credits or 0) < 1:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Kailangan ng token para sa Lihim. Maraming LLM agents at analytics ang tumatakbo — "
                "kailangan ng compute at API cost. Mag-top up (hal. 2 pesos = 1 token)."
            ),
        )
    return user
