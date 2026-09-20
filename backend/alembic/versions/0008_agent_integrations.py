"""Add integrations table for Slack and Discord bot connections

Revision ID: 0008_agent_integrations
Revises: 0007_leads_table
Create Date: 2026-09-19
"""

revision = "0008_agent_integrations"
down_revision = "0007_leads_table"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS integrations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            platform TEXT NOT NULL,
            bot_token TEXT,
            signing_secret TEXT,
            webhook_url TEXT,
            channel_id TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_integrations_user_id ON integrations(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_integrations_agent_id ON integrations(agent_id)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_integrations_agent_platform ON integrations(agent_id, platform)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS integrations CASCADE")
