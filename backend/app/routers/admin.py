import contextlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..cache import invalidate_user_cache
from ..db import SessionFactory, get_db
from ..email import dispatch_operator
from ..models import Agent, Announcement, AnnouncementRead, Conversation, Document, User
from ..ops import (
    _agents_leaderboard,
    _conversations_audit,
    _documents_pipeline,
    _errors_center,
    _grounding_metric,
    _tenants,
    _trends_daily,
    build_ops_status,
    is_operator,
)
from ..storage import delete_original, is_b2_enabled
from .deps import OPS_RATE_MAX, OPS_RATE_WINDOW, _allow_rate_limited

router = APIRouter(prefix="/api")


@router.get("/ops/status")
async def ops_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    return await build_ops_status(db)


@router.get("/ops/grounding")
async def op_grounding(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    return await _grounding_metric(db)


@router.post("/ops/alert")
async def op_alert(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    subject = payload.get("subject", "Operator Alert")
    html = payload.get("html", "")
    if not html:
        html = f"<p>Operator alert: {subject}</p>"
    await dispatch_operator(db, "operator_alert", subject, html)
    return {"status": "alert sent"}


@router.post("/ops/announcements")
async def op_announcements(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    if not _allow_rate_limited("ops_announce", user.id, OPS_RATE_MAX, OPS_RATE_WINDOW):
        raise HTTPException(status_code=429, detail="Rate limit: too many announcements, try again shortly")
    title = payload.get("title", "")
    body = payload.get("body", "")
    severity = payload.get("severity", "info")
    announcement = Announcement(title=title, body=body, severity=severity, created_by=user.id)
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)
    users = (await db.execute(select(User.id))).scalars().all()
    for user_id in users:
        db.add(AnnouncementRead(announcement_id=announcement.id, user_id=user_id))
    await db.commit()
    return {"status": "announcement created", "id": announcement.id}


@router.get("/ops/announcements")
async def op_announcements_list(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    announcements = (await db.execute(
        select(Announcement).order_by(Announcement.created_at.desc()).limit(50)
    )).scalars().all()
    return [
        {
            "id": a.id,
            "title": a.title,
            "body": a.body,
            "severity": a.severity,
            "created_by": a.created_by,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        }
        for a in announcements
    ]


@router.patch("/announcements/{announcement_id}/read")
async def mark_announcement_read(
    announcement_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    announcement = (await db.execute(select(Announcement).where(Announcement.id == announcement_id))).scalar_one_or_none()
    if announcement is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    read_row = (
        await db.execute(
            select(AnnouncementRead).where(
                AnnouncementRead.announcement_id == announcement_id,
                AnnouncementRead.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if read_row is None:
        db.add(
            AnnouncementRead(
                announcement_id=announcement_id,
                user_id=user.id,
                read_at=datetime.now(UTC),
            )
        )
    else:
        read_row.read_at = datetime.now(UTC)
    await db.commit()
    await invalidate_user_cache(user.id)
    return {"status": "read"}


@router.get("/ops/tenants")
async def op_tenants(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    return await _tenants(db)


@router.get("/ops/agents")
async def op_agents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    return await _agents_leaderboard(db)


@router.patch("/ops/agents/{agent_id}")
async def op_update_agent(
    agent_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    agent = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in payload.items():
        if field in {"status", "name", "instructions", "color"}:
            setattr(agent, field, value)
    await db.commit()
    await db.refresh(agent)
    return {"status": "updated", "id": agent.id}


@router.get("/ops/documents")
async def op_documents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    return await _documents_pipeline(db)


@router.get("/ops/trends")
async def op_trends(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    return await _trends_daily(db)


@router.get("/ops/conversations")
async def op_conversations(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    return await _conversations_audit(db)


@router.get("/ops/errors")
async def op_errors(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    return await _errors_center(db)


@router.get("/settings/status")
async def settings_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {
        "db_configured": SessionFactory is not None,
        "b2_enabled": is_b2_enabled(),
    }


@router.delete("/me", status_code=204)
async def delete_workspace(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    docs = (await db.execute(select(Document).where(Document.user_id == user.id))).scalars().all()
    for doc in docs:
        if doc.storage_key and is_b2_enabled():
            with contextlib.suppress(Exception):
                await delete_original(doc.storage_key)
    await db.execute(delete(Conversation).where(Conversation.user_id == user.id))
    await db.execute(delete(Document).where(Document.user_id == user.id))
    await db.execute(delete(Agent).where(Agent.user_id == user.id))
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
    await invalidate_user_cache(user.id)
