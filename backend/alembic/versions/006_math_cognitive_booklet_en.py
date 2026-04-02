"""English booklet prompt for cognitive math screen."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "006_math_cognitive_booklet_en"
down_revision = "005_daily_math_cognitive"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("daily_math_cognitives", sa.Column("booklet_prompt_en", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("daily_math_cognitives", "booklet_prompt_en")
