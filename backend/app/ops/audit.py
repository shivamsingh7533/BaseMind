"""Audit: recent + halted conversations across tenants."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Conversation, User


async def _conversations_audit(db: AsyncSession) -> list[dict]:
    recent_convs = (
        await db.execute(
            select(Conversation)
            .order_by(Conversation.started_at.desc())
            .limit(10)
        )
    ).scalars().all()

    result: list[dict] = []
    for c in recent_convs:
        owner_email = None
        if c.user_id:
            user = (await db.execute(select(User).where(User.id == c.user_id))).scalar_one_or_none()
            if user:
                owner_email = user.email
        result.append(
            {
                'id': c.id,
                'ownerEmail': owner_email,
                'agentId': str(c.agent_id) if c.agent_id else None,
                'status': c.status,
                'preview': (c.preview or '')[:48],
                'startedAt': c.started_at.isoformat() if c.started_at else '',
                'durationSeconds': c.duration_seconds,
            }
        )

    return result