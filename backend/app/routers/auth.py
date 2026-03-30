from time import time

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.auth import OTPRequest, OTPVerify, RefreshRequest, TokenResponse
from app.services.jwt_service import create_access_token, create_refresh_token, decode_token
from app.services.otp_service import get_or_create_user, issue_otp, normalize_phone, verify_otp

router = APIRouter(prefix="/auth", tags=["auth"])

_otp_last_request: dict[str, float] = {}
_OTP_COOLDOWN_SEC = 30.0


@router.post("/otp/request")
def request_otp(body: OTPRequest, db: Session = Depends(get_db)):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    now = time()
    last = _otp_last_request.get(phone)
    if last is not None and now - last < _OTP_COOLDOWN_SEC:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before requesting another code",
        )
    _otp_last_request[phone] = now
    issue_otp(db, phone)
    return {"sent": True}


@router.post("/otp/verify", response_model=TokenResponse)
def verify(body: OTPVerify, db: Session = Depends(get_db)):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone number")
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
    from app.models.user import User

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(str(user.id), {"phone": user.phone_e164})
    new_refresh = create_refresh_token(str(user.id))
    return TokenResponse(access_token=access, refresh_token=new_refresh)
