import uuid

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.user import User
from app.services.jwt_service import create_access_token


def test_premium_requires_unlock():
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
    assert r.status_code == 403


def test_premium_start_unlocks_three_sessions_without_credits():
    phone = "+639" + uuid.uuid4().hex[:9]
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, premium_credits=0, premium_until=None)
            db.add(u)
            db.commit()
            db.refresh(u)
            uid = u.id
            tok = create_access_token(str(u.id))
            rs = client.post(
                "/api/predict/premium/start",
                headers={"Authorization": f"Bearer {tok}"},
            )
            assert rs.status_code == 200
            body = rs.json()
            assert body.get("charged") is False
            assert body.get("premium_credits") == 0
            assert body.get("lihim_unlocked") is True

            r9 = client.get(
                "/api/predict/premium",
                params={"session": "9am"},
                headers={"Authorization": f"Bearer {tok}"},
            )
            r4 = client.get(
                "/api/predict/premium",
                params={"session": "4pm"},
                headers={"Authorization": f"Bearer {tok}"},
            )
            r9b = client.get(
                "/api/predict/premium",
                params={"session": "9pm"},
                headers={"Authorization": f"Bearer {tok}"},
            )
            db.expire_all()
            u2 = db.query(User).filter(User.id == uid).first()
            credits_after = u2.premium_credits if u2 else None
        finally:
            db.close()
    assert r9.status_code == 200
    assert r4.status_code == 200
    assert r9b.status_code == 200
    assert r9.json().get("tier") == "premium"
    assert credits_after == 0


def test_premium_start_does_not_consume_credits_on_repeat():
    phone = "+639" + uuid.uuid4().hex[:9]
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, premium_credits=2, premium_until=None)
            db.add(u)
            db.commit()
            db.refresh(u)
            uid = u.id
            tok = create_access_token(str(u.id))
            r1 = client.post("/api/predict/premium/start", headers={"Authorization": f"Bearer {tok}"})
            r2 = client.post("/api/predict/premium/start", headers={"Authorization": f"Bearer {tok}"})
            db.expire_all()
            u2 = db.query(User).filter(User.id == uid).first()
            credits = u2.premium_credits if u2 else None
        finally:
            db.close()
    assert r1.status_code == 200
    assert r1.json().get("charged") is False
    assert r2.status_code == 200
    assert r2.json().get("charged") is False
    assert credits == 2
