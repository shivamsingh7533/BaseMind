"""Add widget customization fields to agents table

Revision ID: 0006_agent_widget_fields
Revises: 0005_hnsw_vector_index
Create Date: 2026-09-19
"""

revision = "0006_agent_widget_fields"
down_revision = "0005_hnsw_vector_index"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS greeting_message TEXT DEFAULT 'Hi! How can I help you today?'"
    )
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS suggested_questions TEXT DEFAULT '[]'"
    )
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS allowed_domains TEXT DEFAULT ''"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS greeting_message")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS suggested_questions")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS allowed_domains")
