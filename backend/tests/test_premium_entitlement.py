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
            u = User(phone_e164=phone, premium_until=None)
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
