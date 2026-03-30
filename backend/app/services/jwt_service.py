"""JWT create/verify."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from jose import JWTError, jwt

from app.config import get_settings


def create_access_token(subject: str, extra: Optional[Dict[str, Any]] = None) -> str:
    s = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=s.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire, "type": "access", **(extra or {})}
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def create_refresh_token(subject: str) -> str:
    s = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(days=s.refresh_token_expire_days)
    payload = {"sub": subject, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def decode_token(token: str) -> Dict[str, Any]:
    s = get_settings()
    return jwt.decode(token, s.secret_key, algorithms=["HS256"])


def verify_access_token(token: str) -> Optional[str]:
    try:
        data = decode_token(token)
        if data.get("type") != "access":
            return None
        sub = data.get("sub")
        return str(sub) if sub is not None else None
    except JWTError:
        return None
