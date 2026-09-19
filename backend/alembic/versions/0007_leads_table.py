"""Add leads table and agent lead capture fields

Revision ID: 0007_leads_table
Revises: 0006_agent_widget_fields
Create Date: 2026-09-19
"""

revision = "0007_leads_table"
down_revision = "0006_agent_widget_fields"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS lead_capture_enabled BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS lead_capture_title TEXT DEFAULT 'Get in touch'"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
            conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
            name TEXT,
            email TEXT NOT NULL,
            phone TEXT,
            company TEXT,
            message TEXT,
            status TEXT DEFAULT 'new',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_leads_user_id ON leads(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_leads_agent_id ON leads(agent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_leads_conversation_id ON leads(conversation_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_leads_created_at ON leads(created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS leads CASCADE")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS lead_capture_enabled")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS lead_capture_title")
