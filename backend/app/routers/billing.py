"""Razorpay billing: plan, checkout, cancel, and webhook handling."""

import contextlib
import json
import time as _time
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import get_settings
from ..db import get_db
from ..models import Agent, Conversation, Document, EventLog, Message, Subscription, User, Workspace, WorkspaceMember
from ..schemas import PlanLimits

router = APIRouter(prefix="/api")

FREE_AGENT_LIMIT = 1
FREE_DOC_LIMIT = 5


def get_plan_limits(plan: str) -> PlanLimits:
    normalized = (plan or "free").lower()
    if normalized == "enterprise":
        return PlanLimits(
            agents=100,
            documents=1000,
            messagesMonthly=100000,
            teamSeats=50,
            storageMb=5000,
        )
    if normalized == "pro":
        return PlanLimits(
            agents=10,
            documents=100,
            messagesMonthly=10000,
            teamSeats=5,
            storageMb=250,
        )
    return PlanLimits(
        agents=1,
        documents=5,
        messagesMonthly=500,
        teamSeats=1,
        storageMb=15,
    )

_pro_settings: dict | None = None
_client = None


def _get_settings() -> Any:
    global _pro_settings
    if _pro_settings is None:
        _pro_settings = get_settings()
    return _pro_settings


def _get_client() -> Any:
    global _client, _pro_settings
    settings = _get_settings()
    if _client is None:
        if not settings.razorpay_key_id or not settings.razorpay_key_secret:
            return None
        import razorpay  # noqa: PLC0415
        _client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    return _client


def billing_configured() -> bool:
    settings = get_settings()
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


async def get_plan(db: AsyncSession, user_id: str) -> str:
    result = await db.execute(select(Subscription.plan).where(Subscription.user_id == user_id))
    return result.scalar_one_or_none() or "free"


async def _get_or_create_subscription(db: AsyncSession, user_id: str) -> Subscription:
    result = await db.execute(select(Subscription).where(Subscription.user_id == user_id))
    sub = result.scalar_one_or_none()
    if sub is None:
        sub = Subscription(user_id=user_id, plan="free", status="active")
        db.add(sub)
        await db.commit()
        await db.refresh(sub)
    return sub


@router.get("/billing")
async def billing_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sub = await _get_or_create_subscription(db, user.id)
    return {
        "plan": sub.plan,
        "status": sub.status,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "razorpay_configured": billing_configured(),
    }


@router.get("/billing/usage")
async def get_usage_metering(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sub = await _get_or_create_subscription(db, user.id)
    plan = sub.plan
    limits = get_plan_limits(plan)

    # 1. Current Agents
    agent_count = (
        await db.execute(select(func.count(Agent.id)).where(Agent.user_id == user.id))
    ).scalar_one()

    # 2. Current Documents
    doc_count = (
        await db.execute(select(func.count(Document.id)).where(Document.user_id == user.id))
    ).scalar_one()

    # 3. Monthly Messages (last 30 days)
    thirty_days_ago = datetime.now(UTC) - timedelta(days=30)
    msg_count = (
        await db.execute(
            select(func.count(Message.id))
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(Conversation.user_id == user.id, Message.created_at >= thirty_days_ago)
        )
    ).scalar_one()

    # 4. Team Seats (in user's owned workspaces)
    seat_count = (
        await db.execute(
            select(func.count(WorkspaceMember.id))
            .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
            .where(Workspace.owner_id == user.id)
        )
    ).scalar_one() or 1

    # 5. Approximate Storage in MB
    storage_mb = round(doc_count * 1.5, 1)

    pct_agents = min(100.0, round((agent_count / limits.agents) * 100, 1)) if limits.agents else 0.0
    pct_docs = min(100.0, round((doc_count / limits.documents) * 100, 1)) if limits.documents else 0.0
    pct_msgs = min(100.0, round((msg_count / limits.messagesMonthly) * 100, 1)) if limits.messagesMonthly else 0.0
    pct_seats = min(100.0, round((seat_count / limits.teamSeats) * 100, 1)) if limits.teamSeats else 0.0
    pct_storage = min(100.0, round((storage_mb / limits.storageMb) * 100, 1)) if limits.storageMb else 0.0

    warnings = []
    if pct_agents >= 100.0:
        warnings.append(f"Agent limit reached ({agent_count}/{limits.agents}). Upgrade to Pro to create more AI agents.")
    elif pct_agents >= 80.0:
        warnings.append(f"Approaching agent limit ({agent_count}/{limits.agents}).")

    if pct_docs >= 100.0:
        warnings.append(f"Document limit reached ({doc_count}/{limits.documents}). Upgrade to Pro to index more documents.")
    elif pct_docs >= 80.0:
        warnings.append(f"Approaching document limit ({doc_count}/{limits.documents}).")

    if pct_msgs >= 100.0:
        warnings.append(f"Monthly message limit reached ({msg_count}/{limits.messagesMonthly}). Upgrade to Pro for more capacity.")
    elif pct_msgs >= 80.0:
        warnings.append(f"Approaching monthly message limit ({msg_count}/{limits.messagesMonthly}).")

    if pct_seats >= 100.0 and limits.teamSeats == 1:
        warnings.append("Single seat limit (Owner). Upgrade to Pro for multi-seat team workspaces.")

    return {
        "plan": plan,
        "status": sub.status,
        "limits": limits.model_dump(),
        "current": {
            "agents": agent_count,
            "documents": doc_count,
            "messagesMonthly": msg_count,
            "teamSeats": seat_count,
            "storageMb": storage_mb,
        },
        "percentages": {
            "agents": pct_agents,
            "documents": pct_docs,
            "messagesMonthly": pct_msgs,
            "teamSeats": pct_seats,
            "storageMb": pct_storage,
        },
        "warnings": warnings,
    }


@router.post("/billing/checkout", status_code=201)
async def billing_checkout(
    interval: str = "monthly",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from ..cache import invalidate_user_cache

    if interval not in ("monthly", "annual"):
        raise HTTPException(status_code=422, detail="interval must be 'monthly' or 'annual'")

    settings = get_settings()
    client = _get_client()

    if not billing_configured() or client is None:
        sub = await _get_or_create_subscription(db, user.id)
        sub.plan = "pro"
        sub.status = "active"
        db.add(EventLog(
            user_id=user.id,
            event_type="billing_demo_upgrade",
            detail=f"upgraded to pro via demo mode ({interval})",
        ))
        await db.commit()
        await invalidate_user_cache(user.id)
        return {
            "demo": True,
            "url": "",
            "order_id": "",
            "subscription_id": "demo_sub",
            "key_id": "",
            "interval": interval,
            "notice": "Upgraded to Pro in demo mode (no Razorpay keys configured).",
        }

    amount_paise = 499900 if interval == "annual" else 49900
    plan_label = "BaseMind Pro Annual" if interval == "annual" else "BaseMind Pro Monthly"

    # Always create an official Razorpay Order so the animated checkout popup opens cleanly,
    # or fallback to subscription creation if client only provides subscription interface
    receipt_id = f"bm_{user.id[:8]}_{int(_time.time())}"
    try:
        if hasattr(client, "order"):
            order = client.order.create({
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt_id,
                "notes": {
                    "user_id": user.id,
                    "interval": interval,
                    "user_email": user.email or "",
                },
            })
            order_id = order.get("id")
        else:
            plan_id = settings.razorpay_annual_plan_id if interval == "annual" else settings.razorpay_plan_id
            sub_res = client.subscription.create({"plan_id": plan_id, "customer_notify": 1, "total_count": 12})
            order_id = sub_res.get("id")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create Razorpay order: {exc}") from exc

    sub = await _get_or_create_subscription(db, user.id)
    sub.razorpay_subscription_id = order_id
    sub.razorpay_plan_id = f"order_{interval}"
    db.add(EventLog(
        user_id=user.id,
        event_type="billing_order_created",
        detail=f"Razorpay order {order_id} created for {interval} (amount: {amount_paise} paise)",
        ref_id=order_id,
    ))
    await db.commit()

    return {
        "demo": False,
        "url": "",
        "order_id": order_id,
        "subscription_id": order_id,
        "amount": amount_paise,
        "currency": "INR",
        "key_id": settings.razorpay_key_id,
        "name": "BaseMind",
        "description": f"{plan_label} — ₹{amount_paise // 100}",
        "interval": interval,
    }


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str | None = None
    interval: str = "monthly"


@router.post("/billing/verify")
async def billing_verify(
    payload: VerifyPaymentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from ..cache import invalidate_user_cache

    settings = get_settings()
    client = _get_client()

    if client is not None and settings.razorpay_key_secret and payload.razorpay_signature:
        try:
            client.utility.verify_payment_signature({
                "razorpay_order_id": payload.razorpay_order_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature,
            })
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid payment signature: {exc}") from exc

    sub = await _get_or_create_subscription(db, user.id)
    sub.plan = "pro"
    sub.status = "active"
    sub.razorpay_subscription_id = payload.razorpay_order_id
    days = 365 if payload.interval == "annual" else 30
    sub.current_period_end = datetime.now(UTC) + timedelta(days=days)

    db.add(EventLog(
        user_id=user.id,
        event_type="billing_payment_success",
        detail=f"Payment {payload.razorpay_payment_id} verified for order {payload.razorpay_order_id}",
        ref_id=payload.razorpay_payment_id,
    ))
    await db.commit()
    await invalidate_user_cache(user.id)
    return {"status": "ok", "plan": "pro"}


@router.post("/billing/cancel")
async def billing_cancel(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from ..cache import invalidate_user_cache

    sub = await _get_or_create_subscription(db, user.id)
    if sub.razorpay_subscription_id and billing_configured():
        client = _get_client()
        if client and sub.razorpay_subscription_id.startswith("sub_"):
            with contextlib.suppress(Exception):
                client.subscription.cancel(sub.razorpay_subscription_id, {"at_end": 1})
    sub.plan = "free"
    sub.status = "cancelled"
    sub.current_period_end = None
    sub.razorpay_subscription_id = None
    db.add(EventLog(user_id=user.id, event_type="billing_cancel", detail="subscription cancelled / reset to free"))
    await db.commit()
    await invalidate_user_cache(user.id)
    return {"plan": "free", "status": "cancelled"}


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    if not settings.razorpay_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")
    signature = request.headers.get("x-razorpay-signature", "")
    body = (await request.body()).decode("utf-8")

    client = _get_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    try:
        valid = client.utility.verify_webhook_signature(body, signature, settings.razorpay_webhook_secret)
    except Exception:
        valid = False
    if not valid:
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    payload: dict[str, Any] = json.loads(body)
    event = payload.get("event", "")
    entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
    sub_id = entity.get("id")
    if not sub_id:
        payment = payload.get("payload", {}).get("payment", {}).get("entity", {})
        sub_id = payment.get("subscription_id")

    result = await db.execute(select(Subscription).where(Subscription.razorpay_subscription_id == sub_id))
    sub = result.scalar_one_or_none()
    if sub is None:
        return {"received": True, "matched": False}

    period_end = entity.get("current_end")
    if isinstance(period_end, (int, float)) and period_end > 0:
        sub.current_period_end = datetime.fromtimestamp(float(period_end), tz=UTC)

    if event in ("subscription.activated", "subscription.charged", "payment.captured"):
        sub.plan = "pro"
        sub.status = "active"
        customer_id = entity.get("customer_id")
        if customer_id:
            sub.razorpay_customer_id = customer_id
    elif event in ("subscription.completed", "subscription.cancelled", "subscription.halted"):
        sub.plan = "free"
        sub.status = "active" if event == "subscription.cancelled" else event.removeprefix("subscription.")
    elif event == "payment.failed":
        sub.status = "past_due"

    db.add(EventLog(
        user_id=sub.user_id,
        event_type=f"billing_{event}",
        severity="attention" if event in ("subscription.halted", "payment.failed") else "info",
        detail=f"razorpay event {event} for subscription {sub_id}",
    ))
    await db.commit()
    return {"received": True, "matched": True}