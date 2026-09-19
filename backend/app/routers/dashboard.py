from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..cache import cache_get, cache_set
from ..db import get_db
from ..email import dispatch_digest
from ..models import (
    EMBEDDING_DIM,
    Agent,
    Announcement,
    AnnouncementRead,
    Conversation,
    Document,
    DocumentChunk,
    Message,
    User,
)
from ..schemas import _fmt_time

router = APIRouter(prefix="/api")


@router.get("/dashboard")
async def dashboard(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cache_key = f"dash:{user.id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    agents_count = (
        await db.execute(select(func.count()).select_from(Agent).where(Agent.user_id == user.id))
    ).scalar_one()
    docs_count = (
        await db.execute(select(func.count()).select_from(Document).where(Document.user_id == user.id))
    ).scalar_one()
    convs_count = (
        await db.execute(select(func.count()).select_from(Conversation).where(Conversation.user_id == user.id))
    ).scalar_one()

    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    convs_today = (
        await db.execute(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.user_id == user.id, Conversation.started_at >= day_start)
        )
    ).scalar_one()
    agents_today = (
        await db.execute(
            select(func.count()).select_from(Agent).where(Agent.user_id == user.id, Agent.created_at >= day_start)
        )
    ).scalar_one()
    docs_today = (
        await db.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.user_id == user.id, Document.created_at >= day_start)
        )
    ).scalar_one()
    
    # Yesterday counts for delta computation
    convs_yesterday = (
        await db.execute(
            select(func.count())
            .select_from(Conversation)
            .where(
                Conversation.user_id == user.id,
                Conversation.started_at >= day_start - timedelta(days=1),
                Conversation.started_at < day_start,
            )
        ).scalar_one()
    )
    agents_yesterday = (
        await db.execute(
            select(func.count())
            .select_from(Agent)
            .where(Agent.user_id == user.id, Agent.created_at >= day_start - timedelta(days=1), Agent.created_at < day_start)
        ).scalar_one()
    )
    docs_yesterday = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.user_id == user.id, Document.created_at >= day_start - timedelta(days=1), Document.created_at < day_start)
        ).scalar_one()
    )
    active_agents = (
        await db.execute(
            select(func.count()).select_from(Agent).where(Agent.user_id == user.id, Agent.status == "active")
        )
    ).scalar_one()

    top_agent = (
        await db.execute(select(Agent).where(Agent.user_id == user.id).order_by(Agent.queries_24h.desc()).limit(1))
    ).scalar_one_or_none()

    failed_docs = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.user_id == user.id, Document.status == "failed")
        )
    ).scalar_one()

    embeddings_count = (
        await db.execute(select(func.count()).select_from(DocumentChunk).where(DocumentChunk.user_id == user.id))
    ).scalar_one()
    ready_docs = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.user_id == user.id, Document.status == "ready")
        )
    ).scalar_one()
    pending_docs = (
        await db.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.user_id == user.id, Document.status == "processing")
        )
    ).scalar_one()
    if embeddings_count == 0 and pending_docs == 0:
        vector_status = "empty"
    elif pending_docs > 0:
        vector_status = "syncing"
    elif failed_docs > 0:
        vector_status = "attention"
    else:
        vector_status = "synced"
    vector = {
        "embeddings": embeddings_count,
        "indexedDocs": ready_docs,
        "pendingDocs": pending_docs,
        "failedDocs": failed_docs,
        "dim": EMBEDDING_DIM,
        "status": vector_status,
    }

    doc_types = (
        await db.execute(select(Document.type, func.count()).where(Document.user_id == user.id).group_by(Document.type))
    ).all()
    web_count = sum(n for t, n in doc_types if t and str(t).lower().startswith("web"))
    file_count = sum(n for t, n in doc_types) - web_count

    recent_docs = (
        (
            await db.execute(
                select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc()).limit(3)
            )
        )
        .scalars()
        .all()
    )
    recent_agents = (
        (await db.execute(select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc()).limit(2)))
        .scalars()
        .all()
    )
    recent_convs = (
        (
            await db.execute(
                select(Conversation)
                .where(Conversation.user_id == user.id)
                .order_by(Conversation.started_at.desc())
                .limit(3)
            )
        )
        .scalars()
        .all()
    )

    activity: list[dict] = []
    for a in recent_docs:
        failed = a.status == "failed"
        activity.append(
            {
                "id": f"doc-{a.id}",
                "icon": "warning" if failed else "sync",
                "highlight": a.name,
                "text": "failed to index" if failed else "indexed as a knowledge source",
                "time": _fmt_time(a.created_at),
            }
        )
    for ag in recent_agents:
        activity.append(
            {
                "id": f"agent-{ag.id}",
                "icon": "agent",
                "highlight": ag.name,
                "text": "agent created",
                "time": _fmt_time(ag.created_at),
            }
        )
    for c in recent_convs:
        label = (c.preview or "").strip()[:48]
        activity.append(
            {
                "id": f"conv-{c.id}",
                "icon": "agent",
                "highlight": label or "New conversation",
                "text": "conversation started",
                "time": _fmt_time(c.started_at),
            }
        )

    resolution_value = "0%"
    resolution_sub = "needs live traffic"
    if convs_count:
        answered = (
            await db.execute(
                select(func.count())
                .select_from(Message)
                .where(
                    Message.conversation_id.in_(select(Conversation.id).where(Conversation.user_id == user.id)),
                    Message.role == "agent",
                )
            )
        ).scalar_one()
        resolution_value = f"{min(round(answered / convs_count * 100), 100)}%"
        resolution_sub = f"{answered} answered of {convs_count} conversations"

    agents = (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalars().all()
    conv_by_agent = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(Conversation.user_id == user.id)
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    msgs_by_agent = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .select_from(Message)
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.user_id == user.id,
                    Message.role == "agent",
                    Conversation.agent_id.isnot(None),
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    resolved_by_agent = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.status == "resolved",
                    Conversation.agent_id.isnot(None),
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    per_agent = [
        {
            "id": ag.id,
            "name": ag.name,
            "color": ag.color,
            "queries24h": ag.queries_24h,
            "conversations": conv_by_agent.get(ag.id, 0),
            "agentMsgs": msgs_by_agent.get(ag.id, 0),
            "resolved": resolved_by_agent.get(ag.id, 0),
            "avgLatencyMs": ag.avg_latency_ms,
        }
        for ag in agents
    ]
    per_agent.sort(key=lambda a: (-a["agentMsgs"], -a["queries24h"]))

    week_start = day_start - timedelta(days=6)
    conv_day = func.date_trunc(text("'day'"), Conversation.started_at)
    conv_by_day = dict(
        (
            await db.execute(
                select(conv_day, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.started_at >= week_start,
                )
                .group_by(conv_day)
            )
        ).all()
    )
    msg_day = func.date_trunc(text("'day'"), Message.created_at)
    msgs_by_day = dict(
        (
            await db.execute(
                select(msg_day, func.count())
                .select_from(Message)
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.user_id == user.id,
                    Message.role == "agent",
                    Message.created_at >= week_start,
                )
                .group_by(msg_day)
            )
        ).all()
    )
    trend7d = [
        {
            "date": day.strftime("%Y-%m-%d"),
            "conversations": conv_by_day.get(day, 0),
            "agentMsgs": msgs_by_day.get(day, 0),
        }
        for i in range(6, -1, -1)
        for day in (day_start - timedelta(days=i),)
    ]

    stats = [
        {
            "id": "agents",
            "label": "Total Agents",
            "value": str(agents_count),
            "delta": f"+{agents_today - agents_yesterday}" if agents_today else None,
            "sub": (f"{active_agents} active · best: {top_agent.name}" if top_agent else f"{active_agents} active"),
            "progress": min(agents_count * 10, 100),
        },
        {
            "id": "documents",
            "label": "Knowledge Files",
            "value": str(docs_count),
            "delta": f"+{docs_today - docs_yesterday}" if docs_today else None,
            "sub": f"{web_count} web · {file_count} files",
            "progress": min(docs_count * 5, 100),
        },
        {
            "id": "conversations",
            "label": "Conversations",
            "value": str(convs_count),
            "delta": f"+{convs_today - convs_yesterday}" if convs_today else None,
            "sub": f"{convs_today} today",
            "progress": min(convs_count * 2, 100),
        },
        {
            "id": "resolution",
            "label": "Auto-resolution",
            "value": resolution_value,
            "delta": "—",
            "sub": resolution_sub,
            "progress": int(resolution_value[:-1]) if resolution_value != "0%" else 0,
        },
    ]
    unread_announcements = (
        await db.execute(
            select(Announcement)
            .join(AnnouncementRead, AnnouncementRead.announcement_id == Announcement.id)
            .where(
                AnnouncementRead.user_id == user.id,
                AnnouncementRead.read_at.is_(None),
            )
            .order_by(Announcement.created_at.desc())
            .limit(5)
        )
    ).scalars().all()
    announcements = [
        {
            "id": a.id,
            "title": a.title,
            "body": a.body,
            "severity": a.severity,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        }
        for a in unread_announcements
    ]

    payload = {
        "stats": stats,
        "activity": activity[:8],
        "perAgent": per_agent,
        "trend7d": trend7d,
        "vector": vector,
        "announcements": announcements,
    }
    since_24h = datetime.now(UTC) - timedelta(days=1)
    q24 = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.agent_id.isnot(None),
                    Conversation.started_at >= since_24h,
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    r24 = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.agent_id.isnot(None),
                    Conversation.status == "resolved",
                    Conversation.started_at >= since_24h,
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    h24 = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.agent_id.isnot(None),
                    Conversation.status == "halted",
                    Conversation.started_at >= since_24h,
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    await dispatch_digest(
        user,
        {
            "agents": [
                {
                    "name": ag.name,
                    "queries": q24.get(ag.id, 0),
                    "resolved": r24.get(ag.id, 0),
                    "halted": h24.get(ag.id, 0),
                }
                for ag in agents
            ]
        },
    )
    await cache_set(cache_key, payload)
    return payload
