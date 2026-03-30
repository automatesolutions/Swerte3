# Swerte3

AI-assisted Swertres / 3D Lotto companion: **React Native (Expo)** + **FastAPI** + **PostgreSQL**.

- **Free predictions:** XGBoost + Markov (no LLM).
- **Premium:** Miro-style LLM synthesis + council layer (requires API key and entitlement).

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env     # then edit DATABASE_URL, SECRET_KEY, etc.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Run migrations (PostgreSQL):

```bash
cd backend
alembic upgrade head
```

Tests default to SQLite via `tests/conftest.py` so CI does not require Postgres.

### Mobile

```bash
cd mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` (see `mobile/.env.example`) to your backend URL.

## Testing

```bash
cd backend && pytest
cd mobile && npm test
```

## Deploy (sketch)

- **Backend:** [backend/Dockerfile](backend/Dockerfile) and [backend/cloudbuild.yaml](backend/cloudbuild.yaml) for Cloud Run; set env vars ( `DATABASE_URL`, `SECRET_KEY`, `LLM_API_KEY`, `ADMIN_API_KEY`, PayMongo secrets).
- **Mobile:** use EAS Build or Fastlane under [mobile/fastlane](mobile/fastlane) after app signing is configured.
