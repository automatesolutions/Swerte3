import uuid
from datetime import date

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.data.elite_profile_questions import question_for_calendar_day
from app.main import app
from app.models.user import User
from app.services.elite_profile import today_local
from app.services.jwt_service import create_access_token


def test_elite_profile_next_returns_question():
    phone = "+639" + uuid.uuid4().hex[:9]
    today = today_local()
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
    assert body["calendar_date"] == today.isoformat()
    assert body["already_answered_today"] is False
    assert body["elite_ready"] is False
    assert body["question"]["id"]
    assert body["question"]["kind"] == "select"
    assert len(body["question"]["options"]) >= 2


def test_elite_profile_different_question_on_each_ginto_visit():
    phone = "+639" + uuid.uuid4().hex[:9]
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, display_alias="tester_" + uuid.uuid4().hex[:6])
            db.add(u)
            db.commit()
            db.refresh(u)
            tok = create_access_token(str(u.id))
            headers = {"Authorization": f"Bearer {tok}"}

            r1 = client.get("/api/elite/profile/next", headers=headers)
            q1 = r1.json()["question"]["id"]

            r2 = client.get("/api/elite/profile/next", headers=headers)
            q2 = r2.json()["question"]["id"]
            assert q2 != q1
        finally:
            db.close()


def test_elite_profile_requires_mc_answer_before_elite_ready():
    phone = "+639" + uuid.uuid4().hex[:9]
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, display_alias="tester_" + uuid.uuid4().hex[:6])
            db.add(u)
            db.commit()
            db.refresh(u)
            tok = create_access_token(str(u.id))
            headers = {"Authorization": f"Bearer {tok}"}

            r0 = client.post("/api/predict/premium/start", headers=headers)
            assert r0.status_code == 403

            r_next = client.get("/api/elite/profile/next", headers=headers)
            q = r_next.json()["question"]

            bad = client.post(
                "/api/elite/profile/answer",
                headers=headers,
                json={"question_id": q["id"], "answer": "not_a_real_option"},
            )
            assert bad.status_code == 400

            ok = client.post(
                "/api/elite/profile/answer",
                headers=headers,
                json={"question_id": q["id"], "answer": q["options"][0]["value"]},
            )
            assert ok.status_code == 200
            assert ok.json()["elite_ready"] is True

            r1 = client.get("/api/elite/profile/next", headers=headers)
            body1 = r1.json()
            assert body1["already_answered_today"] is True
            assert body1["elite_ready"] is False
            assert body1["question"] is not None
            assert body1["question"]["id"] != q["id"]
            assert "previous_answer" not in body1

            r2 = client.post("/api/predict/premium/start", headers=headers)
            assert r2.status_code == 200
        finally:
            db.close()


def test_daily_question_changes_by_calendar_day():
    d1 = date(2026, 1, 1)
    d2 = date(2026, 1, 2)
    assert question_for_calendar_day(d1).id != question_for_calendar_day(d2) or len(
        question_for_calendar_day(d1).options
    ) > 0


def test_admin_elite_answers_require_key(monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "test-admin-secret")
    from app.config import get_settings

    get_settings.cache_clear()
    phone = "+639" + uuid.uuid4().hex[:9]
    today = today_local()
    with TestClient(app) as client:
        db = SessionLocal()
        try:
            u = User(phone_e164=phone, display_alias="tester_" + uuid.uuid4().hex[:6])
            db.add(u)
            db.commit()
            db.refresh(u)
            tok = create_access_token(str(u.id))
            headers = {"Authorization": f"Bearer {tok}"}
            r_next = client.get("/api/elite/profile/next", headers=headers)
            q = r_next.json()["question"]
            answer_value = q["options"][0]["value"]
            client.post(
                "/api/elite/profile/answer",
                headers=headers,
                json={"question_id": q["id"], "answer": answer_value},
            )
            denied = client.get("/api/internal/admin/elite-answers/summary")
            board = client.get(
                "/api/internal/admin/elite-answers/summary",
                headers={"X-Admin-Key": "test-admin-secret"},
            )
            log = client.get(
                "/api/internal/admin/elite-answers",
                headers={"X-Admin-Key": "test-admin-secret"},
            )
        finally:
            db.close()
            get_settings.cache_clear()
    assert denied.status_code == 403
    assert board.status_code == 200
    body = board.json()
    assert body["answers_today"] >= 1
    assert body["todays_question"]["question_id"] == question_for_calendar_day(today).id
    assert log.status_code == 200
    assert log.json()["total"] >= 1
    assert log.json()["items"][0]["answer_value"] == answer_value
