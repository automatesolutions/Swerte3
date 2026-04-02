"""Prediction vs actual outcomes for error analytics."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "003_prediction_outcomes"
down_revision = "002_premium_credits"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def upgrade() -> None:
    if _table_exists("prediction_outcomes"):
        return
    op.create_table(
        "prediction_outcomes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("prediction_record_id", sa.Integer(), sa.ForeignKey("prediction_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session", sa.String(length=8), nullable=False),
        sa.Column("draw_id", sa.Integer(), sa.ForeignKey("draws.id"), nullable=False),
        sa.Column("hamming", sa.Integer(), nullable=False),
        sa.Column("predicted_digit_1", sa.Integer(), nullable=False),
        sa.Column("predicted_digit_2", sa.Integer(), nullable=False),
        sa.Column("predicted_digit_3", sa.Integer(), nullable=False),
        sa.Column("actual_digit_1", sa.Integer(), nullable=True),
        sa.Column("actual_digit_2", sa.Integer(), nullable=True),
        sa.Column("actual_digit_3", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("prediction_record_id", "session", name="uq_outcome_record_session"),
    )
    op.create_index(op.f("ix_prediction_outcomes_prediction_record_id"), "prediction_outcomes", ["prediction_record_id"])
    op.create_index(op.f("ix_prediction_outcomes_session"), "prediction_outcomes", ["session"])
    op.create_index(op.f("ix_prediction_outcomes_draw_id"), "prediction_outcomes", ["draw_id"])


def downgrade() -> None:
    if not _table_exists("prediction_outcomes"):
        return
    op.drop_table("prediction_outcomes")
