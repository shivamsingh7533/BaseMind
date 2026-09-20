"""Add CSAT message ratings, conversation sentiment, and knowledge_gaps table

Revision ID: 0009_analytics_csat_gaps
Revises: 0008_agent_integrations
Create Date: 2026-09-20
"""

revision = "0009_analytics_csat_gaps"
down_revision = "0008_agent_integrations"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    # 1. Alter messages table with rating (-1 or 1) and feedback reason
    op.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS rating INTEGER")
    op.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_reason TEXT")

    # 2. Alter conversations table with csat_score and sentiment
    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_score INTEGER")
    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sentiment TEXT DEFAULT 'neutral'")

    # 3. Create knowledge_gaps table for missing/uncertain query detection
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS knowledge_gaps (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
            conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
            query TEXT NOT NULL,
            matched_context TEXT,
            ai_response_snippet TEXT,
            reason TEXT DEFAULT 'low_confidence',
            frequency INTEGER DEFAULT 1,
            status TEXT DEFAULT 'unresolved',
            resolution_note TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            last_asked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_user_id ON knowledge_gaps(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_agent_id ON knowledge_gaps(agent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_status ON knowledge_gaps(status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_frequency ON knowledge_gaps(frequency DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_last_asked ON knowledge_gaps(last_asked_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS knowledge_gaps CASCADE")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS sentiment")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS csat_score")
    op.execute("ALTER TABLE messages DROP COLUMN IF EXISTS feedback_reason")
    op.execute("ALTER TABLE messages DROP COLUMN IF EXISTS rating")
