"""Add multimodal vision and continuous crawler sync

Revision ID: 0014_vision_crawler
Revises: 0013_multimodel_llm_gateway_byok
Create Date: 2026-09-21
"""

revision = "0014_vision_crawler"
down_revision = "0013_multimodel_llm_gateway_byok"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    # 1. Add image_url to messages table for vision diagnostics
    op.execute(
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;"
    )

    # 2. Add continuous crawler and sync scheduling columns to documents table
    op.execute(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS sync_schedule TEXT DEFAULT 'manual';"
    )
    op.execute(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;"
    )
    op.execute(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS crawl_depth INTEGER DEFAULT 1;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_documents_sync_schedule ON documents(sync_schedule);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_documents_sync_schedule;")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS crawl_depth;")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS last_synced_at;")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS sync_schedule;")
    op.execute("ALTER TABLE messages DROP COLUMN IF EXISTS image_url;")
