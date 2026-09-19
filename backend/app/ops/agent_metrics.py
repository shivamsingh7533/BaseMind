"""Per-agent usage metrics computed from live data.

queries_24h and avg_latency_ms are derived on read (they are never written to
the agent row) so numbers always reflect actual traffic.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from ..models import Conversation, Message


async def agent_metrics(db: AsyncSession, agent_ids: list[str]) -> dict[str, dict]:
    """Return {agent_id: {"queries24h": int, "avgLatencyMs": int}}."""
    agent_ids = [a for a in agent_ids if a]
    if not agent_ids:
        return {}

    since_24h = datetime.now(UTC) - timedelta(days=1)
    queries = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .select_from(Message)
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.agent_id.in_(agent_ids),
                    Message.role == "user",
                    Message.created_at >= since_24h,
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )

    user_msg = aliased(Message)
    next_agent_msg = aliased(Message)
    next_at = (
        select(next_agent_msg.created_at)
        .where(
            next_agent_msg.conversation_id == user_msg.conversation_id,
            next_agent_msg.role == "agent",
            next_agent_msg.created_at > user_msg.created_at,
        )
        .order_by(next_agent_msg.created_at)
        .limit(1)
        .scalar_subquery()
    )
    latency = dict(
        (
            await db.execute(
                select(
                    Conversation.agent_id,
                    func.round(func.avg(func.extract("epoch", next_at - user_msg.created_at) * 1000)).label("ms"),
                )
                .select_from(user_msg)
                .join(Conversation, Conversation.id == user_msg.conversation_id)
                .where(
                    Conversation.agent_id.in_(agent_ids),
                    user_msg.role == "user",
                    next_at.is_not(None),
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )

    return {
        agent_id: {
            "queries24h": int(queries.get(agent_id, 0) or 0),
            "avgLatencyMs": int(latency.get(agent_id, 0) or 0),
        }
        for agent_id in agent_ids
    }