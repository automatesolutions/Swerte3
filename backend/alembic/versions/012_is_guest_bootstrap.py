"""Mark guest-registered users for placeholder-phone repair on /me."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "012_is_guest_bootstrap"
down_revision = "011_user_display_alias"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if table not in insp.get_table_names():
        return False
    return column in [c["name"] for c in insp.get_columns(table)]


def upgrade() -> None:
    if not _column_exists("users", "is_guest_bootstrap"):
        op.add_column(
            "users",
            sa.Column("is_guest_bootstrap", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    # Guest accounts always use is_placeholder_phone=True until profile save; mark them for /me repair.
    op.execute(
        sa.text("UPDATE users SET is_guest_bootstrap = true WHERE is_placeholder_phone = true"),
    )


def downgrade() -> None:
    if _column_exists("users", "is_guest_bootstrap"):
        op.drop_column("users", "is_guest_bootstrap")
