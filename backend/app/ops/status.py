"""Top-level ops status assembler."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Agent, Conversation, Message
from .activity import _activity
from .constants import RAG_ENGINE_VERSION, SLOW_AGENT_MS_THRESHOLD
from .metrics import _alerts, _metrics, _vector_health


async def build_ops_status(db: AsyncSession) -> dict:
    since_24h = datetime.now(UTC) - timedelta(days=1)
    halted24 = (
        await db.execute(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.status == "halted", Conversation.started_at >= since_24h)
        )
    ).scalar_one()
    traffic24 = (
        await db.execute(
            select(func.count()).select_from(Message).where(Message.role == "user", Message.created_at >= since_24h)
        )
    ).scalar_one()
    slow_agents = (
        await db.execute(select(func.count()).select_from(Agent).where(Agent.avg_latency_ms > SLOW_AGENT_MS_THRESHOLD))
    ).scalar_one()

    generated_at = datetime.now(UTC)
    vector = await _vector_health(db)
    alerts = await _alerts(db, vector, halted24, traffic24, slow_agents)
    nominal = not any(a["severity"] == "error" for a in alerts) and vector["status"] not in {"attention"}

    return {
        "engine": RAG_ENGINE_VERSION,
        "nominal": nominal,
        "generatedAt": generated_at.isoformat(),
        "metrics": await _metrics(db),
        "vector": vector,
        "alerts": alerts,
        "activity": await _activity(db),
    }