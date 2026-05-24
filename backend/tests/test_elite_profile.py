import uuid

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.user import User
from app.services.jwt_service import create_access_token


def test_elite_profile_next_returns_first_question():
    phone = "+639" + uuid.uuid4().hex[:9]
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, display_alias="tester_" + uuid.uuid4().hex[:6])
            db.add(u)
            db.commit()
            db.refresh(u)
            tok = create_access_token(str(u.id))
            r = client.get("/api/elite/profile/next", headers={"Authorization": f"Bearer {tok}"})
        finally:
            db.close()
    assert r.status_code == 200
    body = r.json()
    assert body["question"]["id"] == "age_range"
    assert body["progress"]["primary_answered"] == 0


def test_elite_profile_answer_advances_progress():
    phone = "+639" + uuid.uuid4().hex[:9]
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, display_alias="tester_" + uuid.uuid4().hex[:6])
            db.add(u)
            db.commit()
            db.refresh(u)
            tok = create_access_token(str(u.id))
            client.post(
                "/api/elite/profile/answer",
                headers={"Authorization": f"Bearer {tok}"},
                json={"question_id": "age_range", "answer": "25_34"},
            )
            r = client.get("/api/elite/profile/next", headers={"Authorization": f"Bearer {tok}"})
        finally:
            db.close()
    assert r.status_code == 200
    assert r.json()["question"]["id"] == "city_region"
    assert r.json()["progress"]["primary_answered"] == 1


def test_premium_start_no_longer_requires_credits():
    phone = "+639" + uuid.uuid4().hex[:9]
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, display_alias="t_" + uuid.uuid4().hex[:6], premium_credits=0)
            db.add(u)
            db.commit()
            db.refresh(u)
            tok = create_access_token(str(u.id))
            r = client.post("/api/predict/premium/start", headers={"Authorization": f"Bearer {tok}"})
        finally:
            db.close()
    assert r.status_code == 200
    assert r.json().get("charged") is False
    assert r.json().get("lihim_unlocked") is True
