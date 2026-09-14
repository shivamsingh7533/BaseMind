"""Per-tenant (user) rollups for the ops tenants panel."""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Agent, Conversation, Document, Message, Subscription, User


async def _tenants(db: AsyncSession) -> list[dict]:
    users = (await db.execute(select(User))).scalars().all()

    result: list[dict] = []
    for user in users:
        agents_count = (
            await db.execute(
                select(func.count()).select_from(Agent).where(Agent.user_id == user.id)
            )
            .scalar_one()
        )
        doc_rows = (
            await db.execute(
                select(Document.type, func.count()).select_from(Document).where(Document.user_id == user.id).group_by(Document.type)
            )
        ).all()
        doc_type_counts: dict[str, int] = {str(row.type): row.count for row in doc_rows}
        total_docs = sum(doc_type_counts.values())

        pending_docs = (
            await db.execute(
                select(func.count()).select_from(Document).where(
                    Document.user_id == user.id, Document.status == "processing"
                )
            )
            .scalar_one()
        )
        failed_docs = (
            await db.execute(
                select(func.count()).select_from(Document).where(
                    Document.user_id == user.id, Document.status == "failed"
                )
            )
            .scalar_one()
        )

        convs_count = (
            await db.execute(
                select(func.count()).select_from(Conversation).where(Conversation.user_id == user.id)
            )
            .scalar_one()
        )

        day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        queries_today = (
            await db.execute(
                select(func.count())
                .select_from(Message)
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.user_id == user.id,
                    Message.role == "user",
                    Message.created_at >= day_start,
                )
            )
            .scalar_one()
        )

        sub = (
            await db.execute(select(Subscription.plan).where(Subscription.user_id == user.id))
        ).scalar_one_or_none()

        result.append(
            {
                "email": user.email or "unknown",
                "name": user.name or "Unknown",
                "plan": sub or "free",
                "agents": agents_count,
                "documents": total_docs,
                "docTypeCounts": doc_type_counts,
                "pendingDocs": pending_docs,
                "failedDocs": failed_docs,
                "conversations": convs_count,
                "queriesToday": queries_today,
                "createdAt": user.created_at.isoformat(),
            }
        )

    return result