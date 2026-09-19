"""Add HNSW index on document_chunks.embedding for fast vector similarity search

Revision ID: 0005_hnsw_vector_index
Revises: 0004_add_razorpay
Create Date: 2026-09-19
"""

revision = "0005_hnsw_vector_index"
down_revision = "0004_add_razorpay"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw")
