"""SQLAlchemy engine and session."""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _create_engine():
    settings = get_settings()
    url = settings.database_url
    if url.startswith("sqlite"):
        kwargs = {"connect_args": {"check_same_thread": False}, "echo": settings.debug}
        if ":memory:" in url:
            kwargs["poolclass"] = StaticPool
        else:
            kwargs["pool_pre_ping"] = True
        return create_engine(url, **kwargs)
    return create_engine(url, pool_pre_ping=True, echo=settings.debug)


settings = get_settings()
engine = _create_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
