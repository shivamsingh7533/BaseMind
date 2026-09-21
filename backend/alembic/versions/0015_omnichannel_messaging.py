"""Add omnichannel messaging columns to conversations table

Revision ID: 0015_omnichannel_messaging
Revises: 0014_vision_crawler
Create Date: 2026-09-22
"""

revision = "0015_omnichannel_messaging"
down_revision = "0014_vision_crawler"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    # 1. Add channel column to conversations (default 'web')
    op.execute(
        """
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS channel VARCHAR(32) NOT NULL DEFAULT 'web'
        """
    )
    # 2. Add external_chat_id column to conversations (e.g. phone number or telegram chat ID)
    op.execute(
        """
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS external_chat_id VARCHAR(128)
        """
    )
    # 3. Create indexes for high performance omnichannel lookups
    op.execute("CREATE INDEX IF NOT EXISTS ix_conversations_channel ON conversations(channel)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_conversations_external_chat_id ON conversations(external_chat_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_conversations_agent_channel_chat ON conversations(agent_id, channel, external_chat_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_conversations_agent_channel_chat")
    op.execute("DROP INDEX IF EXISTS ix_conversations_external_chat_id")
    op.execute("DROP INDEX IF EXISTS ix_conversations_channel")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS external_chat_id")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS channel")
