"""Global agent leaderboard for the ops agents panel."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Agent
from .constants import SLOW_AGENT_MS_THRESHOLD


async def _agents_leaderboard(db: AsyncSession) -> list[dict]:
    agents = (
        await db.execute(
            select(Agent)
            .order_by(Agent.queries_24h.desc(), Agent.name)
            .limit(20)
        )
    ).scalars().all()

    result: list[dict] = []
    for a in agents:
        result.append(
            {
                "id": a.id,
                "name": a.name,
                "ownerEmail": a.owner.email if a.owner else None,
                "queries24h": a.queries_24h,
                "status": a.status,
                "active": a.status == "active",
                "avgLatencyMs": a.avg_latency_ms,
                "isSlow": a.avg_latency_ms > SLOW_AGENT_MS_THRESHOLD,
            }
        )

    return result