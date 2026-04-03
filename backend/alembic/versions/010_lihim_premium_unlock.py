"""Lihim: unlock timestamp so one token covers 9AM/4PM/9PM without per-GET credit drain."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "010_lihim_premium_unlock"
down_revision = "009_math_cog_guess_once"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if table not in insp.get_table_names():
        return False
    return column in [c["name"] for c in insp.get_columns(table)]


def upgrade() -> None:
    if _column_exists("users", "lihim_premium_unlocked_at"):
        return
    op.add_column(
        "users",
        sa.Column("lihim_premium_unlocked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    if not _column_exists("users", "lihim_premium_unlocked_at"):
        return
    op.drop_column("users", "lihim_premium_unlocked_at")
