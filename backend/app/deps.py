"""FastAPI dependencies."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
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
