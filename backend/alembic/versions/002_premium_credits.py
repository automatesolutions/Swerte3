"""Add premium_credits for pay-per-prediction (₱2 ≈ 1 premium call)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "002_premium_credits"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def _users_has_premium_credits() -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "users" not in insp.get_table_names():
        return False
    cols = [c["name"] for c in insp.get_columns("users")]
    return "premium_credits" in cols


def upgrade() -> None:
    if _users_has_premium_credits():
        return
    op.add_column(
        "users",
        sa.Column("premium_credits", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("users", "premium_credits", server_default=None)


def downgrade() -> None:
    if not _users_has_premium_credits():
        return
    op.drop_column("users", "premium_credits")
