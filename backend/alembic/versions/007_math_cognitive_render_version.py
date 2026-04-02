"""Track math cognitive image pipeline version; invalidate old DALL·E caches."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# Keep revision id <= 32 chars (alembic_version.version_num is VARCHAR(32)).
revision = "007_math_cog_render_v"
down_revision = "006_math_cognitive_booklet_en"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_math_cognitives",
        sa.Column("render_version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("daily_math_cognitives", "render_version")
