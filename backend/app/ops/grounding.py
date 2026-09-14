"""Grounding metric: % of assistant messages with sources."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Message


async def _grounding_metric(db: AsyncSession) -> dict:
    total = (await db.execute(select(func.count()).select_from(Message))).scalar_one()
    with_sources = (
        await db.execute(select(func.count()).select_from(Message).where(Message.sources.is_not(None)))
    ).scalar_one()
    pct = round(with_sources / total * 100) if total > 0 else 0
    return {"totalMessages": total, "messagesWithSources": with_sources, "groundingPct": pct}