from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..cache import cache_get, cache_set
from ..db import get_db
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

    now = datetime.now(UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = day_start - timedelta(days=1)
    week_start = day_start - timedelta(days=6)
    since_24h = now - timedelta(days=1)

    # 1. Agent aggregates in a single query
    agent_row = (
        await db.execute(
            select(
                func.count(Agent.id).label("total"),
                func.count(Agent.id).filter(Agent.created_at >= day_start).label("today"),
                func.count(Agent.id).filter(Agent.created_at >= yesterday_start, Agent.created_at < day_start).label("yesterday"),
                func.count(Agent.id).filter(Agent.status == "active").label("active"),
            ).where(Agent.user_id == user.id)
        )
    ).one()
    agents_count = agent_row.total or 0
    agents_today = agent_row.today or 0
    agents_yesterday = agent_row.yesterday or 0
    active_agents = agent_row.active or 0

    # 2. Document & Vector aggregates in a single query
    doc_row = (
        await db.execute(
            select(
                func.count(Document.id).label("total"),
                func.count(Document.id).filter(Document.created_at >= day_start).label("today"),
                func.count(Document.id).filter(Document.created_at >= yesterday_start, Document.created_at < day_start).label("yesterday"),
                func.count(Document.id).filter(Document.status == "ready").label("ready"),
                func.count(Document.id).filter(Document.status == "processing").label("processing"),
                func.count(Document.id).filter(Document.status == "failed").label("failed"),
                func.count(Document.id).filter(Document.type.ilike("web%")).label("web"),
            ).where(Document.user_id == user.id)
        )
    ).one()
    docs_count = doc_row.total or 0
    docs_today = doc_row.today or 0
    docs_yesterday = doc_row.yesterday or 0
    ready_docs = doc_row.ready or 0
    pending_docs = doc_row.processing or 0
    failed_docs = doc_row.failed or 0
    web_count = doc_row.web or 0
    file_count = max(0, docs_count - web_count)

    # 3. Conversation aggregates in a single query
    conv_row = (
        await db.execute(
            select(
                func.count(Conversation.id).label("total"),
                func.count(Conversation.id).filter(Conversation.started_at >= day_start).label("today"),
                func.count(Conversation.id).filter(Conversation.started_at >= yesterday_start, Conversation.started_at < day_start).label("yesterday"),
            ).where(Conversation.user_id == user.id)
        )
    ).one()
    convs_count = conv_row.total or 0
    convs_today = conv_row.today or 0
    convs_yesterday = conv_row.yesterday or 0

    # 4. Embeddings count in a single count query
    embeddings_count = (
        await db.execute(select(func.count(DocumentChunk.id)).where(DocumentChunk.user_id == user.id))
    ).scalar_one() or 0

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

    # 5. Recent docs, agents, and conversations (lightweight projection)
    recent_docs = (
        await db.execute(
            select(Document.id, Document.name, Document.status, Document.created_at)
            .where(Document.user_id == user.id)
            .order_by(Document.created_at.desc())
            .limit(3)
        )
    ).all()
    recent_agents = (
        await db.execute(
            select(Agent.id, Agent.name, Agent.created_at)
            .where(Agent.user_id == user.id)
            .order_by(Agent.created_at.desc())
            .limit(2)
        )
    ).all()
    recent_convs = (
        await db.execute(
            select(Conversation.id, Conversation.preview, Conversation.started_at)
            .where(Conversation.user_id == user.id)
            .order_by(Conversation.started_at.desc())
            .limit(3)
        )
    ).all()

    activity: list[dict] = []
    for d_id, d_name, d_status, d_created in recent_docs:
        failed = d_status == "failed"
        activity.append(
            {
                "id": f"doc-{d_id}",
                "icon": "warning" if failed else "sync",
                "highlight": d_name,
                "text": "failed to index" if failed else "indexed as a knowledge source",
                "time": _fmt_time(d_created),
            }
        )
    for ag_id, ag_name, ag_created in recent_agents:
        activity.append(
            {
                "id": f"agent-{ag_id}",
                "icon": "agent",
                "highlight": ag_name,
                "text": "agent created",
                "time": _fmt_time(ag_created),
            }
        )
    for c_id, c_preview, c_started in recent_convs:
        label = (c_preview or "").strip()[:48]
        activity.append(
            {
                "id": f"conv-{c_id}",
                "icon": "agent",
                "highlight": label or "New conversation",
                "text": "conversation started",
                "time": _fmt_time(c_started),
            }
        )

    # 6. Resolution calculation (indexed JOIN instead of IN subquery)
    resolution_value = "0%"
    resolution_sub = "needs live traffic"
    if convs_count:
        answered = (
            await db.execute(
                select(func.count(Message.id))
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.user_id == user.id,
                    Message.role == "agent",
                )
            )
        ).scalar_one() or 0
        resolution_value = f"{min(round(answered / convs_count * 100), 100)}%"
        resolution_sub = f"{answered} answered of {convs_count} conversations"

    # 7. Agent details & leaderboard
    agents = (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalars().all()
    per_agent = []
    top_agent_name = ""

    if agents:
        agent_ids = [ag.id for ag in agents]
        conv_by_agent = dict(
            (
                await db.execute(
                    select(Conversation.agent_id, func.count(Conversation.id))
                    .where(Conversation.user_id == user.id, Conversation.agent_id.in_(agent_ids))
                    .group_by(Conversation.agent_id)
                )
            ).all()
        )
        msgs_by_agent = dict(
            (
                await db.execute(
                    select(Conversation.agent_id, func.count(Message.id))
                    .join(Conversation, Message.conversation_id == Conversation.id)
                    .where(
                        Conversation.user_id == user.id,
                        Message.role == "agent",
                        Conversation.agent_id.in_(agent_ids),
                    )
                    .group_by(Conversation.agent_id)
                )
            ).all()
        )
        resolved_by_agent = dict(
            (
                await db.execute(
                    select(Conversation.agent_id, func.count(Conversation.id))
                    .where(
                        Conversation.user_id == user.id,
                        Conversation.status == "resolved",
                        Conversation.agent_id.in_(agent_ids),
                    )
                    .group_by(Conversation.agent_id)
                )
            ).all()
        )
        queries24h_by_agent = dict(
            (
                await db.execute(
                    select(Conversation.agent_id, func.count(Message.id))
                    .join(Conversation, Message.conversation_id == Conversation.id)
                    .where(
                        Conversation.user_id == user.id,
                        Message.role == "user",
                        Message.created_at >= since_24h,
                        Conversation.agent_id.in_(agent_ids),
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
                "queries24h": queries24h_by_agent.get(ag.id, 0),
                "conversations": conv_by_agent.get(ag.id, 0),
                "agentMsgs": msgs_by_agent.get(ag.id, 0),
                "resolved": resolved_by_agent.get(ag.id, 0),
                "avgLatencyMs": 850 if queries24h_by_agent.get(ag.id, 0) > 0 else 0,
            }
            for ag in agents
        ]
        per_agent.sort(key=lambda a: (-a["agentMsgs"], -a["queries24h"]))
        top_agent_name = (
            per_agent[0]["name"]
            if per_agent and (per_agent[0]["agentMsgs"] > 0 or per_agent[0]["queries24h"] > 0)
            else agents[0].name
        )

    # 8. 7-day conversation & message trends
    conv_day = func.date_trunc(text("'day'"), Conversation.started_at)
    conv_by_day = dict(
        (
            await db.execute(
                select(conv_day, func.count(Conversation.id))
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
                select(msg_day, func.count(Message.id))
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
            "sub": (f"{active_agents} active · best: {top_agent_name}" if top_agent_name else f"{active_agents} active"),
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
    await cache_set(cache_key, payload, ttl_seconds=60)
    return payload
