"""User display alias + placeholder phone flag for guest bootstrap."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "011_user_display_alias"
down_revision = "010_lihim_premium_unlock"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if table not in insp.get_table_names():
        return False
    return column in [c["name"] for c in insp.get_columns(table)]


def upgrade() -> None:
    if not _column_exists("users", "display_alias"):
        op.add_column("users", sa.Column("display_alias", sa.String(32), nullable=True))
    if not _column_exists("users", "is_placeholder_phone"):
        op.add_column(
            "users",
            sa.Column("is_placeholder_phone", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    # Case-sensitive unique on stored alias; app enforces case-insensitive uniqueness.
    try:
        op.create_index("uq_users_display_alias", "users", ["display_alias"], unique=True)
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_index("uq_users_display_alias", table_name="users")
    except Exception:
        pass
    if _column_exists("users", "is_placeholder_phone"):
        op.drop_column("users", "is_placeholder_phone")
    if _column_exists("users", "display_alias"):
        op.drop_column("users", "display_alias")
