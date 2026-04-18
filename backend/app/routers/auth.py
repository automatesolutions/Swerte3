import logging
import re
import secrets
from time import time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from jose import JWTError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.auth import OTPRequest, OTPVerify, ProfileUpdate, RefreshRequest, TokenResponse
from app.services.jwt_service import create_access_token, create_refresh_token, decode_token
from app.services.otp_service import (
    INVALID_PHONE_HINT,
    OtpDeliveryError,
    get_or_create_user,
    issue_otp,
    normalize_otp_code,
    normalize_phone,
    verify_otp,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

ALIAS_PATTERN = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
RESERVED_ALIASES = frozenset(
    {
        "admin",
        "administrator",
        "swerte3",
        "swerte",
        "system",
        "support",
        "moderator",
        "root",
        "official",
        "pcso",
        "help",
        "null",
        "undefined",
    },
)


def _guest_phone_e164() -> str:
    return f"+639{secrets.randbelow(10**9):09d}"


def _me_payload(user: User) -> dict:
    alias = (user.display_alias or "").strip()
    needs_profile = bool(user.is_placeholder_phone or not alias)
    return {
        "phone": user.phone_e164,
        "display_alias": user.display_alias,
        "needs_profile": needs_profile,
        "is_placeholder_phone": bool(user.is_placeholder_phone),
        "is_guest_bootstrap": bool(getattr(user, "is_guest_bootstrap", False)),
        "premium_credits": int(user.premium_credits or 0),
        "lihim_unlocked": user.lihim_premium_unlocked_at is not None,
    }


def _repair_guest_placeholder_if_needed(db: Session, user: User) -> None:
    """Guest accounts must keep is_placeholder_phone=True until a real number is saved."""
    if not getattr(user, "is_guest_bootstrap", False):
        return
    if (user.display_alias or "").strip():
        return
    if user.is_placeholder_phone:
        return
    row = db.query(User).filter(User.id == user.id).first()
    if row is None:
        return
    row.is_placeholder_phone = True
    db.commit()
    db.refresh(row)
    user.is_placeholder_phone = True


@router.get("/me")
def read_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Current user wallet + profile flags for the mobile home screen."""
    _repair_guest_placeholder_if_needed(db, user)
    return _me_payload(user)


@router.post("/guest", response_model=TokenResponse)
def register_guest(db: Session = Depends(get_db)) -> TokenResponse:
    """Create a lightweight account (synthetic PH-style number) and return JWT — no SMS."""
    for _ in range(25):
        phone = _guest_phone_e164()
        if db.query(User).filter(User.phone_e164 == phone).first():
            continue
        u = User(
            phone_e164=phone,
            is_placeholder_phone=True,
            is_guest_bootstrap=True,
            premium_credits=0,
        )
        db.add(u)
        try:
            db.commit()
            db.refresh(u)
        except IntegrityError:
            db.rollback()
            continue
        access = create_access_token(str(u.id), {"phone": phone})
        refresh = create_refresh_token(str(u.id))
        return TokenResponse(access_token=access, refresh_token=refresh)
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Could not allocate guest id")


@router.get("/alias-check")
def alias_check(
    alias: str = Query(..., min_length=1, max_length=24),
    db: Session = Depends(get_db),
):
    raw = alias.strip()
    if not ALIAS_PATTERN.fullmatch(raw):
        return {"available": False, "reason": "invalid"}
    if raw.lower() in RESERVED_ALIASES:
        return {"available": False, "reason": "reserved"}
    taken = db.query(User.id).filter(func.lower(User.display_alias) == raw.lower()).first()
    return {"available": taken is None}


@router.put("/profile")
def update_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Set real mobile + unique alias (no OTP)."""
    alias_raw = body.alias.strip()
    if not ALIAS_PATTERN.fullmatch(alias_raw):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Alias: 3–20 characters, letters, numbers, or underscore only.",
        )
    if alias_raw.lower() in RESERVED_ALIASES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This alias is reserved.")

    taken_alias = (
        db.query(User)
        .filter(func.lower(User.display_alias) == alias_raw.lower(), User.id != user.id)
        .first()
    )
    if taken_alias:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That alias is already taken. Please choose another.",
        )

    if user.is_placeholder_phone:
        if not (body.phone and body.phone.strip()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Phone number is required. {INVALID_PHONE_HINT}",
            )
        phone_norm = normalize_phone(body.phone)
        if not phone_norm:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid phone. {INVALID_PHONE_HINT}")
        taken_phone = db.query(User).filter(User.phone_e164 == phone_norm, User.id != user.id).first()
        if taken_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That mobile number is already used on another account.",
            )
        user.phone_e164 = phone_norm
        user.is_placeholder_phone = False
        user.is_guest_bootstrap = False

    user.display_alias = alias_raw
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Alias or phone conflict. Try a different alias.",
        ) from None

    return _me_payload(user)

_otp_last_request: dict[str, float] = {}
_OTP_COOLDOWN_SEC = 30.0


@router.post("/otp/request")
def request_otp(body: OTPRequest, db: Session = Depends(get_db)):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(status_code=400, detail=f"Invalid phone number. {INVALID_PHONE_HINT}")
    now = time()
    last = _otp_last_request.get(phone)
    if last is not None and now - last < _OTP_COOLDOWN_SEC:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before requesting another code",
        )
    _otp_last_request[phone] = now
    try:
        issue_otp(db, phone)
    except OtpDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=exc.message,
        ) from exc
    return {"sent": True}


@router.post("/otp/verify", response_model=TokenResponse)
def verify(body: OTPVerify, db: Session = Depends(get_db)):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(status_code=400, detail=f"Invalid phone number. {INVALID_PHONE_HINT}")
    settings = get_settings()
    submitted = normalize_otp_code(body.code)
    fixed_raw = (settings.otp_test_code or "").strip().strip('"').strip("'")
    if (
        (settings.debug or settings.otp_test_mode)
        and fixed_raw
        and re.fullmatch(r"\d{6}", fixed_raw)
        and submitted == fixed_raw
    ):
        if settings.debug:
            logger.info("OTP dev bypass: signed in %s with OTP_TEST_CODE (no prior /otp/request needed).", phone)
        user = get_or_create_user(db, phone)
        access = create_access_token(str(user.id), {"phone": phone})
        refresh = create_refresh_token(str(user.id))
        return TokenResponse(access_token=access, refresh_token=refresh)
    if not verify_otp(db, phone, body.code.strip()):
        raise HTTPException(status_code=401, detail="Invalid or expired code")
    user = get_or_create_user(db, phone)
    access = create_access_token(str(user.id), {"phone": phone})
    refresh = create_refresh_token(str(user.id))
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    try:
        data = decode_token(body.refresh_token)
        if data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        uid = int(data["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(str(user.id), {"phone": user.phone_e164})
    new_refresh = create_refresh_token(str(user.id))
    return TokenResponse(access_token=access, refresh_token=new_refresh)
