# Swerte3

AI-assisted Swertres / 3D Lotto companion: **Web app (React + Vite)** + **FastAPI** + **PostgreSQL**. The original React Native (Expo) app is still in `mobile/`.

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
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Port **8001** avoids a common clash: another FastAPI app already bound to `127.0.0.1:8000` (the browser will hit that one, and `/api/auth/guest` returns 404). If 8001 is free and nothing else owns 8000, `8000` is still fine — match `VITE_API_URL` to whatever port you pass.

Run migrations (PostgreSQL):

```bash
cd backend
alembic upgrade head
```

Tests default to SQLite via `tests/conftest.py` so CI does not require Postgres.

### Web app

```bash
cd web
npm install
copy .env.example .env.local   # VITE_API_URL must be the Swerte3 API (default http://127.0.0.1:8001)
npm run dev                    # http://localhost:5173
```

- `npm run build` writes a static site to `web/dist/`. Host it anywhere (Firebase Hosting, Cloud Storage + CDN, Netlify, Vercel). Route every unknown path to `index.html` (single-page app).
- GCash checkout returns to `<your site>/checkout-done`. The API accepts `https` return URLs, and plain `http` only for `localhost` / `127.0.0.1`.
- Set `API_CORS_ORIGINS` on the backend to your web origin in production.
- Design system: tokens in `web/src/styles/tokens.css` (light and dark), fonts Cabinet Grotesk + Satoshi (Fontshare), Tabler icons, GSAP motion (off when the user prefers reduced motion).
- Hero and Elite images were generated with Kie AI and live in `web/public/img/`.

### Mobile (legacy)

```bash
cd mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` (see `mobile/.env.example`) to your backend URL.

## Testing

```bash
cd backend && pytest
cd web && npm test
```

## Deploy (sketch)

- **Backend:** [backend/Dockerfile](backend/Dockerfile) and [backend/cloudbuild.yaml](backend/cloudbuild.yaml) for Cloud Run; set env vars (`DATABASE_URL`, `SECRET_KEY`, `LLM_API_KEY`, `ADMIN_API_KEY`, PayPal `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`, return URLs).
- **Mobile:** use EAS Build or Fastlane under [mobile/fastlane](mobile/fastlane) after app signing is configured.
