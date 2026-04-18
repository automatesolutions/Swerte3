"""Swerte3 API entrypoint."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, engine, ensure_users_table_schema
from app.routers import analytics, auth, health, ingest, math_cognitive, payments, picture_analysis, predict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(title="Swerte3 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")
app.include_router(picture_analysis.router, prefix="/api")
app.include_router(math_cognitive.router, prefix="/api")


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
