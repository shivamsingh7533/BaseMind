"""Unified activity feed for the ops overview panel."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Agent, Conversation, Document, EventLog
from ..schemas import _fmt_time

_EVENT_META: dict[str, tuple[str, str]] = {
    "email_welcome": ("info", "Welcome email sent"),
    "email_digest": ("info", "Daily agent digest sent"),
    "email_rate_limit": ("error", "Rate limit alert emailed"),
    "rate_limit": ("error", "API rate limit triggered"),
    "chat_stream_error": ("error", "Chat stream failed mid-response"),
    "ingest_error": ("error", "Knowledge ingestion failed"),
}

_SEVERITY_ICON = {"info": "sync", "attention": "warning", "error": "error"}


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