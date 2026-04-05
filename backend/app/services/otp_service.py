"""Phone OTP — console, Twilio, or Semaphore (Philippines)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import random
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union

import httpx
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models.otp import OTPChallenge
from app.models.user import User

logger = logging.getLogger(__name__)

SEMAPHORE_OTP_URL = "https://api.semaphore.co/api/v4/otp"

INVALID_PHONE_HINT = (
    "Use a Philippine mobile with at least 10 digits, e.g. 09171234567 or 9171234567 "
    "(JSON body: {\"phone\": \"09171234567\"}, Content-Type: application/json)."
)


class OtpDeliveryError(Exception):
    """SMS provider failed (misconfiguration or upstream error)."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class TwilioSmsError(OtpDeliveryError):
    """Twilio-specific failure (kept for clarity in logs)."""


class SemaphoreSmsError(OtpDeliveryError):
    """Semaphore-specific failure."""


def _send_twilio_sms(to_e164: str, body: str) -> None:
    s = get_settings()
    sid = (s.twilio_account_sid or "").strip()
    token = (s.twilio_auth_token or "").strip()
    from_num = (s.twilio_from_number or "").strip()
    if not sid or not token or not from_num:
        raise TwilioSmsError(
            "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
        )
    auth = base64.b64encode(f"{sid}:{token}".encode("utf-8")).decode("ascii")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            url,
            data={"To": to_e164, "From": from_num, "Body": body},
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
    if r.status_code >= 400:
        detail = r.text[:800] if r.text else r.reason_phrase
        raise TwilioSmsError(f"Twilio rejected the message ({r.status_code}): {detail}")


def _semaphore_number_digits(phone_e164: str) -> str:
    d = re.sub(r"\D+", "", phone_e164)
    if d.startswith("0") and len(d) >= 11:
        return "63" + d[1:]
    if d.startswith("63"):
        return d
    if d.startswith("9") and len(d) == 10:
        return "63" + d
    return d


def _send_semaphore_otp(phone_e164: str, code: str) -> None:
    """Philippines-only SMS via Semaphore OTP route (custom code matches our DB hash)."""
    s = get_settings()
    apikey = (s.semaphore_api_key or "").strip()
    if not apikey:
        raise SemaphoreSmsError(
            "Semaphore is not configured. Set SEMAPHORE_API_KEY (from https://www.semaphore.co/).",
        )
    number = _semaphore_number_digits(phone_e164)
    if not number.startswith("63") or len(number) < 12:
        raise SemaphoreSmsError("Semaphore sends to Philippine numbers only; expected +63… format.")
    sender = (s.semaphore_sender_name or "").strip()
    data: dict[str, str] = {
        "apikey": apikey,
        "number": number,
        "message": "Swerte3: your verification code is {otp}. Valid 10 minutes.",
        "code": code,
    }
    if sender:
        data["sendername"] = sender
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            SEMAPHORE_OTP_URL,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if r.status_code >= 400:
        detail = r.text[:800] if r.text else r.reason_phrase
        raise SemaphoreSmsError(f"Semaphore error ({r.status_code}): {detail}")
    try:
        payload: Any = r.json()
    except json.JSONDecodeError:
        raise SemaphoreSmsError("Semaphore returned non-JSON response.")
    rows = payload if isinstance(payload, list) else [payload] if isinstance(payload, dict) else []
    if not rows:
        raise SemaphoreSmsError("Semaphore returned an empty response.")
    first = rows[0] if isinstance(rows[0], dict) else {}
    st = str(first.get("status") or "").lower()
    if st == "failed":
        raise SemaphoreSmsError(f"Semaphore reported failed delivery: {first}")


def normalize_phone(phone_raw: Optional[Union[str, int]]) -> Optional[str]:
    """Normalize to +63… E.164-style key (light validation, PH-focused)."""
    if phone_raw is None:
        return None
    if isinstance(phone_raw, int):
        phone_raw = str(phone_raw)
    if not isinstance(phone_raw, str):
        return None
    s = unicodedata.normalize("NFKC", phone_raw.strip())
    if not s or s.lower() in {"null", "none", "undefined", ""}:
        return None
    d = re.sub(r"\D+", "", s)
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


def normalize_otp_code(code_raw: Union[str, int, None]) -> Optional[str]:
    """NFKC + digits only (handles spaces, full-width digits from some keyboards)."""
    if code_raw is None:
        return None
    if isinstance(code_raw, int):
        code_raw = str(code_raw)
    if not isinstance(code_raw, str):
        return None
    s = unicodedata.normalize("NFKC", code_raw.strip())
    digits = "".join(c for c in s if c.isdigit())
    if len(digits) != 6:
        return None
    return digits


def _issue_code(settings: Settings) -> str:
    raw = (settings.otp_test_code or "").strip().strip('"').strip("'")
    if raw and re.fullmatch(r"\d{6}", raw) and (settings.debug or settings.otp_test_mode):
        return raw
    return f"{random.randint(0, 999999):06d}"


def issue_otp(db: Session, phone: str) -> str:
    settings = get_settings()
    code = _issue_code(settings)
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    invalidated = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.phone_e164 == phone,
            OTPChallenge.consumed.is_(False),
        )
        .update({"consumed": True}, synchronize_session=False)
    )
    if invalidated and settings.debug:
        logger.debug("Invalidated %s prior OTP challenge(s) for %s", invalidated, phone)
    row = OTPChallenge(phone_e164=phone, code_hash=_hash_code(phone, code), expires_at=expires)
    db.add(row)
    db.commit()

    prov = settings.sms_provider.lower().strip()
    if prov == "console":
        print(f"[OTP console] {phone} -> {code}")
        return code
    if prov == "twilio":
        _send_twilio_sms(phone, f"Your Swerte3 verification code is: {code}")
        return code
    if prov == "semaphore":
        _send_semaphore_otp(phone, code)
        return code
    raise ValueError(
        f"Unknown SMS_PROVIDER={settings.sms_provider!r}; use 'console', 'twilio', or 'semaphore'. PH SMS: set 'semaphore'.",
    )


def verify_otp(db: Session, phone: str, code: str) -> bool:
    normalized = normalize_otp_code(code)
    if not normalized:
        return False
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
        if get_settings().debug:
            logger.info("OTP verify: no active challenge for %s (request a new code after server restart; codes expire in 10m).", phone)
        return False
    if hmac.compare_digest(q.code_hash, _hash_code(phone, normalized)):
        q.consumed = True
        db.commit()
        return True
    if get_settings().debug:
        logger.info("OTP verify: code mismatch for %s (use latest code from most recent Send OTP).", phone)
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
