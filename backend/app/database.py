"""SQLAlchemy engine and session."""
from __future__ import annotations

import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def ensure_users_table_schema(engine) -> None:
    """
    create_all() only creates missing tables — it does NOT add new columns to existing tables.
    Dev DBs created before migrations 010–012 will 500 on /api/auth/me without these columns.

    PostgreSQL: use ADD COLUMN IF NOT EXISTS (PG 11+) so we never skip columns due to reflection quirks.
    SQLite: inspect + ALTER (IF NOT EXISTS for ADD COLUMN is not portable on older SQLite).
    """
    dialect = engine.dialect.name
    is_sqlite = dialect == "sqlite"
    is_pg = dialect == "postgresql"

    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return

    if is_pg:
        _ensure_users_columns_postgresql(engine)
        return

    cols = {c["name"] for c in insp.get_columns("users")}

    alters: list[str] = []
    if "display_alias" not in cols:
        alters.append("ALTER TABLE users ADD COLUMN display_alias VARCHAR(32)")
    if "is_placeholder_phone" not in cols:
        alters.append(
            "ALTER TABLE users ADD COLUMN is_placeholder_phone BOOLEAN NOT NULL DEFAULT 0"
            if is_sqlite
            else "ALTER TABLE users ADD COLUMN is_placeholder_phone BOOLEAN NOT NULL DEFAULT false"
        )
    if "is_guest_bootstrap" not in cols:
        alters.append(
            "ALTER TABLE users ADD COLUMN is_guest_bootstrap BOOLEAN NOT NULL DEFAULT 0"
            if is_sqlite
            else "ALTER TABLE users ADD COLUMN is_guest_bootstrap BOOLEAN NOT NULL DEFAULT false"
        )
    if "lihim_premium_unlocked_at" not in cols:
        alters.append(
            "ALTER TABLE users ADD COLUMN lihim_premium_unlocked_at DATETIME"
            if is_sqlite
            else "ALTER TABLE users ADD COLUMN lihim_premium_unlocked_at TIMESTAMPTZ"
        )
    if "premium_until" not in cols:
        alters.append(
            "ALTER TABLE users ADD COLUMN premium_until DATETIME"
            if is_sqlite
            else "ALTER TABLE users ADD COLUMN premium_until TIMESTAMPTZ"
        )

    if not alters:
        return

    with engine.begin() as conn:
        for stmt in alters:
            conn.execute(text(stmt))

    cols_after = {c["name"] for c in inspect(engine).get_columns("users")}
    if "is_guest_bootstrap" in cols_after and "is_placeholder_phone" in cols_after:
        with engine.begin() as conn:
            if is_sqlite:
                conn.execute(
                    text(
                        "UPDATE users SET is_guest_bootstrap = 1 "
                        "WHERE is_placeholder_phone = 1 AND is_guest_bootstrap = 0"
                    )
                )
            else:
                conn.execute(
                    text(
                        "UPDATE users SET is_guest_bootstrap = true "
                        "WHERE is_placeholder_phone = true AND is_guest_bootstrap = false"
                    )
                )

    logger.info("Applied users table column patches: %s", [a.split()[-1] for a in alters])


def _ensure_users_columns_postgresql(engine) -> None:
    """Idempotent column adds for PostgreSQL (matches alembic 010–012)."""
    stmts = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_alias VARCHAR(32)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_placeholder_phone BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest_bootstrap BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS lihim_premium_unlocked_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ",
    ]
    try:
        with engine.begin() as conn:
            for stmt in stmts:
                conn.execute(text(stmt))
            conn.execute(
                text(
                    "UPDATE users SET is_guest_bootstrap = true "
                    "WHERE is_placeholder_phone = true AND is_guest_bootstrap = false"
                )
            )
        logger.info("PostgreSQL users table: ensured profile/guest columns (IF NOT EXISTS)")
    except ProgrammingError as e:
        # PG < 11 has no ADD COLUMN IF NOT EXISTS; fall back to inspect + plain ALTER TABLE
        err = str(e.orig) if getattr(e, "orig", None) else str(e)
        if "if not exists" in err.lower() or "syntax error" in err.lower():
            logger.warning("PostgreSQL IF NOT EXISTS unsupported; using inspect-based ALTER: %s", err)
            _ensure_users_columns_postgresql_legacy_inspect(engine)
        else:
            raise


def _ensure_users_columns_postgresql_legacy_inspect(engine) -> None:
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("users", schema="public")}
    alters: list[str] = []
    if "display_alias" not in cols:
        alters.append("ALTER TABLE users ADD COLUMN display_alias VARCHAR(32)")
    if "is_placeholder_phone" not in cols:
        alters.append(
            "ALTER TABLE users ADD COLUMN is_placeholder_phone BOOLEAN NOT NULL DEFAULT false"
        )
    if "is_guest_bootstrap" not in cols:
        alters.append(
            "ALTER TABLE users ADD COLUMN is_guest_bootstrap BOOLEAN NOT NULL DEFAULT false"
        )
    if "lihim_premium_unlocked_at" not in cols:
        alters.append(
            "ALTER TABLE users ADD COLUMN lihim_premium_unlocked_at TIMESTAMPTZ"
        )
    if "premium_until" not in cols:
        alters.append("ALTER TABLE users ADD COLUMN premium_until TIMESTAMPTZ")
    if not alters:
        return
    with engine.begin() as conn:
        for stmt in alters:
            conn.execute(text(stmt))
    cols_after = {c["name"] for c in inspect(engine).get_columns("users", schema="public")}
    if "is_guest_bootstrap" in cols_after and "is_placeholder_phone" in cols_after:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE users SET is_guest_bootstrap = true "
                    "WHERE is_placeholder_phone = true AND is_guest_bootstrap = false"
                )
            )
    logger.info("PostgreSQL users table: applied legacy column patches: %s", alters)


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
    return create_engine(
        url,
        pool_pre_ping=True,
        echo=settings.debug,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=settings.db_pool_recycle,
    )


settings = get_settings()
engine = _create_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
