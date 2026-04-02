from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_predict_free_requires_session():
    with TestClient(app) as client:
        r = client.get("/api/predict/free")
    assert r.status_code == 422


def test_predict_free_shape():
    with TestClient(app) as client:
        r = client.get("/api/predict/free", params={"session": "9am"})
    assert r.status_code == 200
    data = r.json()
    assert "models" in data and "XGBoost" in data["models"] and "Markov" in data["models"]


def test_premium_requires_auth():
    with TestClient(app) as client:
        r = client.get("/api/predict/premium", params={"session": "9am"})
    assert r.status_code == 401


def test_picture_analysis_daily_requires_auth():
    with TestClient(app) as client:
        r = client.get("/api/picture-analysis/daily")
    assert r.status_code == 401


def test_math_cognitive_daily_requires_auth():
    with TestClient(app) as client:
        r = client.get("/api/math-cognitive/daily")
    assert r.status_code == 401


def test_math_cognitive_guess_requires_auth():
    with TestClient(app) as client:
        r = client.post("/api/math-cognitive/daily/guess", json={"guess": "1"})
    assert r.status_code == 401
