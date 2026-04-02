"""Daily math cognitive puzzle cache."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "005_daily_math_cognitive"
down_revision = "004_daily_picture_analysis"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def upgrade() -> None:
    if _table_exists("daily_math_cognitives"):
        return
    op.create_table(
        "daily_math_cognitives",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("calendar_date", sa.Date(), nullable=False),
        sa.Column("image_b64", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=32), nullable=False, server_default="image/png"),
        sa.Column("expected_answer", sa.String(length=8), nullable=False),
        sa.Column("tip_tagalog", sa.Text(), nullable=False),
        sa.Column("title_tagalog", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "calendar_date", name="uq_daily_math_user_date"),
    )
    op.create_index("ix_daily_math_cognitives_user_id", "daily_math_cognitives", ["user_id"])
    op.create_index("ix_daily_math_cognitives_calendar_date", "daily_math_cognitives", ["calendar_date"])


def downgrade() -> None:
    op.drop_table("daily_math_cognitives")
