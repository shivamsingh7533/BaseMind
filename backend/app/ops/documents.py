"""Global document pipeline stats for the ops documents panel."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Document, DocumentChunk


async def _documents_pipeline(db: AsyncSession) -> dict:
    ready = (
        await db.execute(select(func.count()).select_from(Document).where(Document.status == "ready"))
    ).scalar_one()
    pending = (
        await db.execute(select(func.count()).select_from(Document).where(Document.status == "processing"))
    ).scalar_one()
    failed = (
        await db.execute(select(func.count()).select_from(Document).where(Document.status == "failed"))
    ).scalar_one()
    total = ready + pending + failed
    embeddings = (await db.execute(select(func.count()).select_from(DocumentChunk))).scalar_one()

    type_rows = (await db.execute(select(Document.type, func.count()).select_from(Document).group_by(Document.type))).all()
    type_counts: dict[str, int] = {str(row.type): row.count for row in type_rows}

    return {
        "totalDocs": total,
        "readyDocs": ready,
        "pendingDocs": pending,
        "failedDocs": failed,
        "embeddings": embeddings,
        "typeCounts": type_counts,
    }