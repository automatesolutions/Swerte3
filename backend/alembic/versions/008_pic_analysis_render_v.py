"""Picture analysis: render_version + invalidate old cached images."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "008_pic_analysis_render_v"
down_revision = "007_math_cog_render_v"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_picture_analyses",
        sa.Column("render_version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("daily_picture_analyses", "render_version")
