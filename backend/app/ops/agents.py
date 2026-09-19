"""Global agent leaderboard for the ops agents panel."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import Agent
from .agent_metrics import agent_metrics
from .constants import SLOW_AGENT_MS_THRESHOLD


async def _agents_leaderboard(db: AsyncSession) -> list[dict]:
    agents = (await db.execute(select(Agent).options(selectinload(Agent.owner)))).scalars().all()
    metrics = await agent_metrics(db, [a.id for a in agents])
    agents.sort(key=lambda a: (-metrics[a.id]["queries24h"], a.name))
    agents = agents[:20]

    result: list[dict] = []
    for a in agents:
        m = metrics[a.id]
        result.append(
            {
                "id": a.id,
                "name": a.name,
                "ownerEmail": a.owner.email if a.owner else None,
                "queries24h": m["queries24h"],
                "status": a.status,
                "active": a.status == "active",
                "avgLatencyMs": m["avgLatencyMs"],
                "isSlow": m["avgLatencyMs"] > SLOW_AGENT_MS_THRESHOLD,
                "instructions": a.instructions or "",
            }
        )

    return result