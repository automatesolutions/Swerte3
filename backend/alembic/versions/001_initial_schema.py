"""Initial schema via SQLAlchemy metadata."""

from alembic import op

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    from app import models  # noqa: F401 — register mappers
    from app.database import Base

    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    from app import models  # noqa: F401
    from app.database import Base

    Base.metadata.drop_all(bind=bind)
