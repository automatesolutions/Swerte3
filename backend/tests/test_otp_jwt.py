import hashlib
import hmac

from app.config import get_settings
from app.services.jwt_service import create_access_token, verify_access_token
from app.services.otp_service import _hash_code


def test_jwt_roundtrip(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-jwt-only")
    get_settings.cache_clear()
    tok = create_access_token("42")
    assert verify_access_token(tok) == "42"
    get_settings.cache_clear()


def test_otp_hash_stable(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "otp-secret")
    get_settings.cache_clear()
    a = _hash_code("+639171234567", "123456")
    b = _hash_code("+639171234567", "123456")
    assert a == b
    get_settings.cache_clear()
