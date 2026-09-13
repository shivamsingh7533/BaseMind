"""Ops/Admin status: global metrics, vector health, derived alerts, unified activity feed."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import (
    EMBEDDING_DIM,
    Agent,
    Conversation,
    Document,
    DocumentChunk,
    EventLog,
    Message,
    User,
)
from .schemas import _fmt_time

log = logging.getLogger("basemind.ops")

RAG_ENGINE_VERSION = "3.4"

HIGH_TRAFFIC_THRESHOLD = 50
SLOW_AGENT_MS_THRESHOLD = 30_000

_EVENT_META: dict[str, tuple[str, str]] = {
    "email_welcome": ("info", "Welcome email sent"),
    "email_digest": ("info", "Daily agent digest sent"),
    "email_rate_limit": ("error", "Rate limit alert emailed"),
    "rate_limit": ("error", "API rate limit triggered"),
    "chat_stream_error": ("error", "Chat stream failed mid-response"),
    "ingest_error": ("error", "Knowledge ingestion failed"),
}

_SEVERITY_ICON = {"info": "sync", "attention": "warning", "error": "error"}


def is_operator(user: "object") -> bool:
    if not getattr(user, "email", None):
        return False
    allowed = [e.strip().lower() for e in get_settings().operator_emails.split(",") if e.strip()]
    return user.email.lower() in allowed


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


async def _activity(db: AsyncSession) -> list[dict]:
    events = (
        (await db.execute(select(EventLog).order_by(EventLog.created_at.desc()).limit(25))).scalars().all()
    )
    agents = (
        (await db.execute(select(Agent).order_by(Agent.created_at.desc()).limit(5))).scalars().all()
    )
    docs = (
        (await db.execute(select(Document).order_by(Document.created_at.desc()).limit(5))).scalars().all()
    )
    convs = (
        (await db.execute(select(Conversation).order_by(Conversation.started_at.desc()).limit(5))).scalars().all()
    )

    items: list[dict] = []
    for row in events:
        severity, label = _EVENT_META.get(row.event_type, ("info", row.event_type.replace("_", " ").title()))
        items.append(
            {
                "id": f"evt-{row.id}",
                "kind": "event",
                "severity": severity,
                "icon": _SEVERITY_ICON.get(severity, "sync"),
                "highlight": label,
                "text": row.detail or "",
                "time": _fmt_time(row.created_at),
                "at": row.created_at.isoformat() if row.created_at else "",
            }
        )
    for a in agents:
        items.append(
            {
                "id": f"agent-{a.id}",
                "kind": "agent",
                "severity": "info",
                "icon": "agent",
                "highlight": a.name,
                "text": "agent created",
                "time": _fmt_time(a.created_at),
                "at": a.created_at.isoformat() if a.created_at else "",
            }
        )
    for d in docs:
        failed = d.status == "failed"
        items.append(
            {
                "id": f"doc-{d.id}",
                "kind": "document",
                "severity": "error" if failed else "info",
                "icon": "warning" if failed else "sync",
                "highlight": d.name,
                "text": "failed to index" if failed else "indexed as a knowledge source",
                "time": _fmt_time(d.created_at),
                "at": d.created_at.isoformat() if d.created_at else "",
            }
        )
    for c in convs:
        label = (c.preview or "").strip()[:48]
        items.append(
            {
                "id": f"conv-{c.id}",
                "kind": "conversation",
                "severity": "info",
                "icon": "agent",
                "highlight": label or "New conversation",
                "text": "conversation started",
                "time": _fmt_time(c.started_at),
                "at": c.started_at.isoformat() if c.started_at else "",
            }
        )

    items.sort(key=lambda it: it["at"], reverse=True)
    return items[:12]


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