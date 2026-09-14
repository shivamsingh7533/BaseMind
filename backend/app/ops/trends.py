"""Daily trend series (queries, conversations, users, agents) for the ops trends panel."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Agent, Conversation, Message, User


async def _trends_daily(db: AsyncSession, days: int = 14) -> list[dict]:
    since = datetime.now(UTC) - timedelta(days=days)

    daily_queries = (
        await db.execute(
            select(func.date(Message.created_at), func.count())
            .select_from(Message)
            .where(Message.role == "user", Message.created_at >= since)
            .group_by(func.date(Message.created_at))
            .order_by(func.date(Message.created_at))
        )
    ).all()
    queries_map: dict[str, int] = {str(row[0]): row[1] for row in daily_queries}

    daily_convs = (
        await db.execute(
            select(func.date(Conversation.started_at), func.count())
            .select_from(Conversation)
            .where(Conversation.started_at >= since)
            .group_by(func.date(Conversation.started_at))
            .order_by(func.date(Conversation.started_at))
        )
    ).all()
    convs_map: dict[str, int] = {str(row[0]): row[1] for row in daily_convs}

    daily_users = (
        await db.execute(
            select(func.date(User.created_at), func.count())
            .select_from(User)
            .where(User.created_at >= since)
            .group_by(func.date(User.created_at))
            .order_by(func.date(User.created_at))
        )
    ).all()
    users_map: dict[str, int] = {str(row[0]): row[1] for row in daily_users}

    daily_agents = (
        await db.execute(
            select(func.date(Agent.created_at), func.count())
            .select_from(Agent)
            .where(Agent.created_at >= since)
            .group_by(func.date(Agent.created_at))
            .order_by(func.date(Agent.created_at))
        )
    ).all()
    agents_map: dict[str, int] = {str(row[0]): row[1] for row in daily_agents}

    result: list[dict] = []
    for i in range(days - 1, -1, -1):
        d = (datetime.now(UTC) - timedelta(days=i)).strftime("%Y-%m-%d")
        result.append(
            {
                "date": d,
                "queries": queries_map.get(d, 0),
                "conversations": convs_map.get(d, 0),
                "newUsers": users_map.get(d, 0),
                "newAgents": agents_map.get(d, 0),
            }
        )

    return result