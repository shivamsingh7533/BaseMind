"""Add live agent handover columns to conversations and messages

Revision ID: 0010_live_agent_handover
Revises: 0009_analytics_csat_gaps
Create Date: 2026-09-20
"""

revision = "0010_live_agent_handover"
down_revision = "0009_analytics_csat_gaps"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    # 1. Alter conversations table with handover requested timestamp and assigned operator
    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handover_requested_at TIMESTAMPTZ")
    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_to TEXT")

    # 2. Alter messages table with sender_name (e.g. for human operator or custom sender)
    op.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT")

    # 3. Create index on conversations status and handover timestamp for fast queue filtering
    op.execute("CREATE INDEX IF NOT EXISTS ix_conversations_status ON conversations(status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_conversations_handover ON conversations(handover_requested_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_conversations_handover")
    op.execute("DROP INDEX IF EXISTS ix_conversations_status")
    op.execute("ALTER TABLE messages DROP COLUMN IF EXISTS sender_name")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS assigned_to")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS handover_requested_at")
