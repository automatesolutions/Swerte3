"""Math cognitive: one guess submission per user per calendar day."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "009_math_cog_guess_once"
down_revision = "008_pic_analysis_render_v"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_math_cognitives",
        sa.Column("guess_submitted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("daily_math_cognitives", "guess_submitted_at")
