"""Phone OTP — dev-friendly console provider + Twilio hook."""
from __future__ import annotations

import hashlib
import hmac
import random
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.otp import OTPChallenge
from app.models.user import User


def normalize_phone(phone_raw: str) -> Optional[str]:
    """Very light normalization to a canonical key (not full E.164 validation)."""
    d = re.sub(r"\D+", "", phone_raw or "")
    if len(d) < 10:
        return None
    if d.startswith("63"):
        return "+" + d
    if d.startswith("0"):
        return "+63" + d[1:]
    if d.startswith("9") and len(d) == 10:
        return "+63" + d
    return "+" + d


def _hash_code(phone: str, code: str) -> str:
    s = get_settings()
    return hmac.new(s.secret_key.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def issue_otp(db: Session, phone: str) -> str:
    settings = get_settings()
    code = f"{random.randint(0, 999999):06d}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    row = OTPChallenge(phone_e164=phone, code_hash=_hash_code(phone, code), expires_at=expires)
    db.add(row)
    db.commit()

    if settings.sms_provider.lower() == "console":
        print(f"[OTP console] {phone} -> {code}")
    # Twilio branch left for you to wire with credentials
    return code


def verify_otp(db: Session, phone: str, code: str) -> bool:
    now = datetime.now(timezone.utc)
    q = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.phone_e164 == phone,
            OTPChallenge.consumed.is_(False),
            OTPChallenge.expires_at > now,
        )
        .order_by(OTPChallenge.created_at.desc())
        .first()
    )
    if not q:
        return False
    if hmac.compare_digest(q.code_hash, _hash_code(phone, code)):
        q.consumed = True
        db.commit()
        return True
    return False


def get_or_create_user(db: Session, phone: str) -> User:
    u = db.query(User).filter(User.phone_e164 == phone).first()
    if u:
        return u
    u = User(phone_e164=phone)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u
