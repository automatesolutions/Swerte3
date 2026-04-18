import uuid

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


def test_picture_analysis_daily_allows_unauthenticated():
    """Litrato: no JWT — server uses shared anonymous user (may 502/503 if image API unset)."""
    with TestClient(app) as client:
        r = client.get("/api/picture-analysis/daily")
    assert r.status_code != 401


def test_math_cognitive_daily_allows_unauthenticated():
    with TestClient(app) as client:
        r = client.get("/api/math-cognitive/daily")
    assert r.status_code != 401


def test_math_cognitive_guess_without_auth_uses_anonymous_context():
    """Guess without JWT uses same anonymous user as GET /daily (404 if daily not loaded first)."""
    with TestClient(app) as client:
        r = client.post("/api/math-cognitive/daily/guess", json={"guess": "1"})
    assert r.status_code != 401


def test_auth_guest_returns_tokens():
    with TestClient(app) as client:
        r = client.post("/api/auth/guest")
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data and "refresh_token" in data


def test_auth_me_includes_profile_flags():
    with TestClient(app) as client:
        g = client.post("/api/auth/guest")
        assert g.status_code == 200
        token = g.json()["access_token"]
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    me = r.json()
    assert me.get("needs_profile") is True
    assert me.get("is_placeholder_phone") is True
    assert me.get("is_guest_bootstrap") is True


def test_auth_profile_saves_phone_and_alias():
    alias = f"t_{uuid.uuid4().hex[:12]}"
    with TestClient(app) as client:
        g = client.post("/api/auth/guest")
        token = g.json()["access_token"]
        r = client.put(
            "/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": "09171234567", "alias": alias},
        )
    assert r.status_code == 200
    me = r.json()
    assert me.get("needs_profile") is False
    assert me.get("display_alias") == alias
    assert me.get("phone") == "+639171234567"
    assert me.get("is_guest_bootstrap") is False


def test_auth_alias_check():
    with TestClient(app) as client:
        r = client.get("/api/auth/alias-check", params={"alias": "admin"})
    assert r.status_code == 200
    assert r.json().get("available") is False


def test_auth_me_repairs_inconsistent_guest_placeholder():
    """Legacy row: guest flag set but placeholder false — /me restores placeholder so mobile can edit phone."""
    from app.database import SessionLocal
    from app.models.user import User
    from app.services.jwt_service import create_access_token

    with TestClient(app) as client:
        unique = f"+639{uuid.uuid4().int % 10**9:09d}"
        db = SessionLocal()
        try:
            u = User(
                phone_e164=unique,
                is_placeholder_phone=False,
                is_guest_bootstrap=True,
                display_alias=None,
                premium_credits=0,
            )
            db.add(u)
            db.commit()
            db.refresh(u)
            token = create_access_token(str(u.id), {"phone": unique})
        finally:
            db.close()

        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    me = r.json()
    assert me.get("is_placeholder_phone") is True
    assert me.get("needs_profile") is True
