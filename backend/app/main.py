"""Swerte3 API entrypoint."""
from __future__ import annotations

import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app import BOOT_T0
from app.config import get_settings
from app.database import Base, engine, ensure_users_table_schema
from app.routers import analytics, auth, health, ingest, math_cognitive, payments, picture_analysis, predict, token_survey
from app.services import jev

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(title="Swerte3 API", version="0.1.0")

_cors_origins = settings.cors_origins_list
_cors_wildcard = _cors_origins == ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Browsers reject Access-Control-Allow-Origin: * when credentials are allowed.
    allow_credentials=not _cors_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers cap this at 2 h; saves a CORS preflight round trip on most authenticated calls.
    max_age=7200,
)


@app.middleware("http")
async def jev_timing(request: Request, call_next):
    """Server-Timing on every response; one JSON timing line per auth call or cold request."""
    cold, age_s = jev.begin_request()
    t0 = time.perf_counter()
    response = await call_next(request)
    total_ms = (time.perf_counter() - t0) * 1000
    response.headers["Server-Timing"] = jev.server_timing_header(total_ms)
    response.headers["Timing-Allow-Origin"] = "*"
    path = request.url.path
    if cold or path.startswith("/api/auth/"):
        jev.log(
            "request_timing",
            method=request.method,
            path=path,
            status=response.status_code,
            ms=round(total_ms, 1),
            stages={name: round(ms, 1) for name, ms in jev.collected_stages()},
            first_request_on_instance=cold,
            instance_age_s=round(age_s, 1),
        )
    return response

app.include_router(health.router)
app.include_router(auth.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")
app.include_router(picture_analysis.router, prefix="/api")
app.include_router(math_cognitive.router, prefix="/api")
app.include_router(token_survey.router, prefix="/api")


@app.on_event("startup")
def startup():
    import app.models  # noqa: F401 — register all ORM tables
    Base.metadata.create_all(bind=engine)
    try:
        ensure_users_table_schema(engine)
    except Exception:
        logger.exception(
            "ensure_users_table_schema failed — run `alembic upgrade head` or fix PostgreSQL permissions"
        )
    logger.info("Swerte3 API started; tables ensured")
    jev.startup_report(BOOT_T0)
