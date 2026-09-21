"""Add agent_actions table for AI function calling and tool execution

Revision ID: 0012_agent_actions_tool_calling
Revises: 0011_agent_whitelabel_branding
Create Date: 2026-09-21
"""

revision = "0012_agent_actions_tool_calling"
down_revision = "0011_agent_whitelabel_branding"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_actions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            webhook_url TEXT NOT NULL,
            method TEXT NOT NULL DEFAULT 'POST',
            headers_json TEXT DEFAULT '{}',
            parameters_schema_json TEXT DEFAULT '[]',
            enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_agent_actions_agent_id ON agent_actions(agent_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_agent_actions_user_id ON agent_actions(user_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_actions")
