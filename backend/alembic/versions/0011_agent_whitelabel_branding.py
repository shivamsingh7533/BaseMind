"""Add whitelabel branding columns to agents

Revision ID: 0011_agent_whitelabel_branding
Revises: 0010_live_agent_handover
Create Date: 2026-09-20
"""

revision = "0011_agent_whitelabel_branding"
down_revision = "0010_live_agent_handover"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    op.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS hide_branding BOOLEAN DEFAULT FALSE")
    op.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS custom_brand_name TEXT DEFAULT ''")


def downgrade() -> None:
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS custom_brand_name")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS hide_branding")
