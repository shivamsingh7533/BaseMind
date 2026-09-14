"""Global metrics, vector health, and derived alerts for the ops dashboard."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import EMBEDDING_DIM, Agent, Conversation, Document, DocumentChunk, Message, User
from ..schemas import _fmt_time
from .constants import HIGH_TRAFFIC_THRESHOLD


async def _metrics(db: AsyncSession) -> dict:
    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = day_start - timedelta(days=1)

    users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    agents = (await db.execute(select(func.count()).select_from(Agent))).scalar_one()
    active = (
        await db.execute(select(func.count()).select_from(Agent).where(Agent.status == "active"))
    ).scalar_one()
    convs = (await db.execute(select(func.count()).select_from(Conversation))).scalar_one()
    convs_today = (
        await db.execute(
            select(func.count()).select_from(Conversation).where(Conversation.started_at >= day_start)
        )
    ).scalar_one()

    total_queries = (
        await db.execute(select(func.count()).select_from(Message).where(Message.role == "user"))
    ).scalar_one()
    queries_today = (
        await db.execute(
            select(func.count())
            .select_from(Message)
            .where(Message.role == "user", Message.created_at >= day_start)
        )
    ).scalar_one()
    queries_prev = (
        await db.execute(
            select(func.count())
            .select_from(Message)
            .where(Message.role == "user", Message.created_at >= yesterday_start, Message.created_at < day_start)
        )
    ).scalar_one()
    delta = round((queries_today - queries_prev) / queries_prev * 100) if queries_prev > 0 else None

    return {
        "users": users,
        "agents": agents,
        "activeAgents": active,
        "totalQueries": total_queries,
        "queriesToday": queries_today,
        "queriesDeltaPct": delta,
        "conversations": convs,
        "conversationsToday": convs_today,
    }


async def _vector_health(db: AsyncSession) -> dict:
    ready = (
        await db.execute(select(func.count()).select_from(Document).where(Document.status == "ready"))
    ).scalar_one()
    pending = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.status == "processing")
        )
    ).scalar_one()
    failed = (
        await db.execute(select(func.count()).select_from(Document).where(Document.status == "failed"))
    ).scalar_one()
    embeddings = (await db.execute(select(func.count()).select_from(DocumentChunk))).scalar_one()

    if embeddings == 0 and pending == 0:
        status = "empty"
    elif pending > 0:
        status = "syncing"
    elif failed > 0:
        status = "attention"
    else:
        status = "synced"

    return {
        "embeddings": embeddings,
        "indexedDocs": ready,
        "pendingDocs": pending,
        "failedDocs": failed,
        "dim": EMBEDDING_DIM,
        "status": status,
    }


async def _alerts(
    db: AsyncSession,
    vector: dict,
    halted24: int,
    traffic24: int,
    slow_agents: int,
) -> list[dict]:
    now = datetime.now(UTC)
    alerts: list[dict] = []
    if vector["failedDocs"] > 0:
        alerts.append(
            {
                "id": "vector-failed",
                "severity": "error",
                "icon": "warning",
                "text": f"{vector['failedDocs']} document(s) failed to index",
                "time": _fmt_time(now),
            }
        )
    elif vector["status"] == "syncing":
        alerts.append(
            {
                "id": "vector-syncing",
                "severity": "attention",
                "icon": "sync",
                "text": f"Vector sync in progress — {vector['pendingDocs']} document(s) pending embedding",
                "time": _fmt_time(now),
            }
        )
    elif vector["status"] == "attention":
        alerts.append(
            {
                "id": "vector-attention",
                "severity": "attention",
                "icon": "warning",
                "text": "Vector store needs attention — failed documents present",
                "time": _fmt_time(now),
            }
        )
    if halted24 > 0:
        alerts.append(
            {
                "id": "halted-24h",
                "severity": "attention",
                "icon": "warning",
                "text": f"{halted24} conversation(s) halted in last 24h (rate limit)",
                "time": _fmt_time(now),
            }
        )
    if traffic24 > HIGH_TRAFFIC_THRESHOLD:
        alerts.append(
            {
                "id": "traffic-spike",
                "severity": "attention",
                "icon": "warning",
                "text": f"High traffic — {traffic24} user queries in last 24h",
                "time": _fmt_time(now),
            }
        )
    if slow_agents > 0:
        alerts.append(
            {
                "id": "slow-agents",
                "severity": "attention",
                "icon": "warning",
                "text": f"{slow_agents} agent(s) slow — avg latency above 30s",
                "time": _fmt_time(now),
            }
        )
    return alerts