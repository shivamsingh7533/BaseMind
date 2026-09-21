"""Add multi-model LLM gateway and BYOK user API keys

Revision ID: 0013_multimodel_llm_gateway_byok
Revises: 0012_agent_actions_tool_calling
Create Date: 2026-09-21
"""

revision = "0013_multimodel_llm_gateway_byok"
down_revision = "0012_agent_actions_tool_calling"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    # 1. Add model selection columns to agents table
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS model_provider TEXT DEFAULT 'gemini';"
    )
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS model_name TEXT DEFAULT 'gemini-2.5-flash';"
    )
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS fallback_model TEXT DEFAULT 'gemini-2.5-flash';"
    )
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION DEFAULT 0.2;"
    )

    # 2. Create user_api_keys table for BYOK
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_api_keys (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            provider TEXT NOT NULL,
            key_hash_suffix TEXT NOT NULL,
            api_key_encrypted TEXT NOT NULL,
            base_url TEXT,
            is_valid BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_user_provider UNIQUE (user_id, provider)
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_api_keys_user_id ON user_api_keys(user_id);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_api_keys;")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS temperature;")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS fallback_model;")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS model_name;")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS model_provider;")
