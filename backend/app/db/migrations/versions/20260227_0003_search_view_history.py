"""search paper view history

Revision ID: 20260227_0003
Revises: 20260226_0002
Create Date: 2026-02-27 07:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260227_0003"
down_revision = "20260226_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "paper_view_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("paper_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "paper_id", name="uq_paper_view_user_paper"),
    )
    op.create_index("ix_paper_view_history_user_id", "paper_view_history", ["user_id"], unique=False)
    op.create_index("ix_paper_view_history_paper_id", "paper_view_history", ["paper_id"], unique=False)
    op.create_index("ix_paper_view_history_viewed_at", "paper_view_history", ["viewed_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_paper_view_history_viewed_at", table_name="paper_view_history")
    op.drop_index("ix_paper_view_history_paper_id", table_name="paper_view_history")
    op.drop_index("ix_paper_view_history_user_id", table_name="paper_view_history")
    op.drop_table("paper_view_history")
