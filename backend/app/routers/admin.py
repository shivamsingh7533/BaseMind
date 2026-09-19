import contextlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..cache import invalidate_user_cache
from ..db import SessionFactory, get_db
from ..email import dispatch_operator
from ..models import Agent, Announcement, AnnouncementRead, Conversation, Document, EventLog, Subscription, User
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
from ..schemas import AnnouncementCreate, OperatorAlert
from ..storage import delete_original, is_b2_enabled
from .deps import OPS_RATE_MAX, OPS_RATE_WINDOW, _allow_rate_limited

router = APIRouter(prefix="/api")


@router.get("/ops/check")
async def ops_check(user: User = Depends(get_current_user)):
    return {"is_operator": is_operator(user)}


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
    payload: OperatorAlert,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    html = payload.html or f"<p>Operator alert: {payload.subject}</p>"
    await dispatch_operator(db, "operator_alert", payload.subject, html)
    return {"status": "alert sent"}


@router.post("/ops/announcements")
async def op_announcements(
    payload: AnnouncementCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    if not _allow_rate_limited("ops_announce", user.id, OPS_RATE_MAX, OPS_RATE_WINDOW):
        raise HTTPException(status_code=429, detail="Rate limit: too many announcements, try again shortly")
    announcement = Announcement(
        title=payload.title,
        body=payload.body,
        severity=payload.severity,
        created_by=user.id,
    )
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


async def _delete_user(db: AsyncSession, user_id: str) -> None:
    docs = (await db.execute(select(Document).where(Document.user_id == user_id))).scalars().all()
    for doc in docs:
        if doc.storage_key and is_b2_enabled():
            with contextlib.suppress(Exception):
                await delete_original(doc.storage_key)
    await db.execute(delete(Conversation).where(Conversation.user_id == user_id))
    await db.execute(delete(Document).where(Document.user_id == user_id))
    await db.execute(delete(Agent).where(Agent.user_id == user_id))
    await db.execute(delete(EventLog).where(EventLog.user_id == user_id))
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()
    await invalidate_user_cache(user_id)


@router.delete("/me", status_code=204)
async def delete_workspace(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _delete_user(db, user.id)


@router.delete("/ops/users/{user_id}", status_code=204)
async def admin_delete_user(
    user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    deleted_email = target.email or target.clerk_id
    await _delete_user(db, user_id)
    db.add(EventLog(
        user_id=user.id,
        event_type="admin_delete_user",
        severity="attention",
        detail=f"deleted user {deleted_email}",
    ))
    await db.commit()


@router.patch("/ops/users/{user_id}")
async def admin_update_user(
    user_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_operator(user):
        raise HTTPException(status_code=403, detail="Operator access only")
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    plan = payload.get("plan")
    if plan is not None:
        if plan not in ("free", "pro"):
            raise HTTPException(status_code=422, detail="plan must be 'free' or 'pro'")
        sub = (
            await db.execute(select(Subscription).where(Subscription.user_id == user_id))
        ).scalar_one_or_none()
        if sub is None:
            sub = Subscription(user_id=user_id, plan="free", status="active")
            db.add(sub)
        sub.plan = plan

    platform_status = payload.get("status")
    if platform_status is not None:
        if platform_status not in ("active", "suspended"):
            raise HTTPException(status_code=422, detail="status must be 'active' or 'suspended'")
        target.platform_status = platform_status

    if plan is not None or platform_status is not None:
        db.add(EventLog(
            user_id=user.id,
            event_type="admin_update_user",
            detail=f"set user {target.email or target.clerk_id} plan={plan} status={platform_status}",
        ))
        await db.commit()
        await invalidate_user_cache(user_id)
    return {
        "user_id": target.id,
        "email": target.email or "unknown",
        "plan": plan,
        "platform_status": platform_status,
    }
