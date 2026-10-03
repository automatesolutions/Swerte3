"""Add tokens via three analytics answers — no payment."""
from fastapi.testclient import TestClient

from app.main import app
from app.services.token_survey import SURVEY_TOKEN_REWARD, pick_questions


def _guest(client: TestClient) -> str:
    r = client.post("/api/auth/guest")
    assert r.status_code == 200
    return r.json()["access_token"]


def test_survey_awards_ten_tokens_once():
    with TestClient(app) as client:
        token = _guest(client)
        headers = {"Authorization": f"Bearer {token}"}
        nxt = client.get("/api/tokens/survey", headers=headers)
        assert nxt.status_code == 200
        body = nxt.json()
        assert body["already_claimed"] is False
        assert len(body["questions"]) == 3
        answers = [{"question_id": q["id"], "answer": q["choices"][0]} for q in body["questions"]]
        done = client.post("/api/tokens/survey", headers=headers, json={"answers": answers})
        assert done.status_code == 200
        assert done.json()["tokens_added"] == SURVEY_TOKEN_REWARD
        me = client.get("/api/auth/me", headers=headers)
        assert me.json()["premium_credits"] == SURVEY_TOKEN_REWARD
        again = client.post("/api/tokens/survey", headers=headers, json={"answers": answers})
        assert again.status_code == 409


def test_survey_rejects_incomplete_answers():
    with TestClient(app) as client:
        token = _guest(client)
        headers = {"Authorization": f"Bearer {token}"}
        nxt = client.get("/api/tokens/survey", headers=headers)
        q0 = nxt.json()["questions"][0]
        bad = client.post(
            "/api/tokens/survey",
            headers=headers,
            json={"answers": [{"question_id": q0["id"], "answer": q0["choices"][0]}]},
        )
        assert bad.status_code == 400
        me = client.get("/api/auth/me", headers=headers)
        assert me.json()["premium_credits"] == 0


def test_pick_questions_is_three_distinct():
    from datetime import date

    qs = pick_questions(1, date(2026, 10, 3))
    assert len(qs) == 3
    assert len({q["id"] for q in qs}) == 3
