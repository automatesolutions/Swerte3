import uuid

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.user import User
from app.services.jwt_service import create_access_token


def test_premium_requires_subscription():
    phone = "+639" + uuid.uuid4().hex[:9]
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, premium_credits=0, premium_until=None)
            db.add(u)
            db.commit()
            db.refresh(u)
            tok = create_access_token(str(u.id))
            r = client.get(
                "/api/predict/premium",
                params={"session": "9am"},
                headers={"Authorization": f"Bearer {tok}"},
            )
        finally:
            db.close()
    assert r.status_code == 402


def test_premium_consumes_one_credit():
    phone = "+639" + uuid.uuid4().hex[:9]
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, premium_credits=1, premium_until=None)
            db.add(u)
            db.commit()
            db.refresh(u)
            uid = u.id
            tok = create_access_token(str(u.id))
            r = client.get(
                "/api/predict/premium",
                params={"session": "9am"},
                headers={"Authorization": f"Bearer {tok}"},
            )
            db.expire_all()
            u2 = db.query(User).filter(User.id == uid).first()
            credits_after = u2.premium_credits if u2 else None
        finally:
            db.close()
    assert r.status_code == 200
    assert r.json().get("tier") == "premium"
    assert credits_after == 0
