"""Test defaults: in-memory SQLite so CI does not need PostgreSQL."""
import os

# Must run before `app.database` is imported by test modules.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
