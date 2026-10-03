"""Store Add-tokens survey answers (one reward per user per day)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "013_token_survey_answers"
down_revision = "012_is_guest_bootstrap"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def upgrade() -> None:
    if _table_exists("token_survey_answers"):
        return
    op.create_table(
        "token_survey_answers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("calendar_date", sa.Date(), nullable=False),
        sa.Column("question_id", sa.String(length=64), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.Column("tokens_awarded", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "calendar_date", name="uq_token_survey_user_date"),
    )
    op.create_index("ix_token_survey_answers_user_id", "token_survey_answers", ["user_id"])
    op.create_index("ix_token_survey_answers_calendar_date", "token_survey_answers", ["calendar_date"])
    op.create_index("ix_token_survey_answers_question_id", "token_survey_answers", ["question_id"])


def downgrade() -> None:
    if _table_exists("token_survey_answers"):
        op.drop_table("token_survey_answers")
