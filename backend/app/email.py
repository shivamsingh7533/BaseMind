"""Brevo transactional email client with deduplication."""

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import SessionFactory
from .models import EventLog

log = logging.getLogger("basemind.email")

_COOLDOWNS: dict[str, timedelta] = {
    "welcome": timedelta(days=365),
    "digest": timedelta(hours=23),
    "rate_limit": timedelta(minutes=10),
    "escalation": timedelta(minutes=2),
    "new_lead": timedelta(minutes=1),
}


def _enabled() -> bool:
    return os.getenv("BREVO_ENABLED", "0") == "1"


def _key() -> str:
    return os.getenv("BREVO_API_KEY", "")


def _sender_email() -> str:
    return os.getenv("BREVO_SENDER_EMAIL", "no-reply@basemind.ai")


def _sender_name() -> str:
    return os.getenv("BREVO_SENDER_NAME", "BaseMind")


async def _note_sent(db: AsyncSession, event_type: str, user_id: str, detail: str = "") -> None:
    db.add(EventLog(user_id=user_id, event_type=f"email_{event_type}", detail=detail))
    await db.commit()


async def _should_send(db: AsyncSession, event_type: str, user_id: str) -> bool:
    cooldown = _COOLDOWNS.get(event_type)
    if cooldown is None:
        return True
    cutoff = datetime.now(UTC) - cooldown
    row = (
        await db.execute(
            select(EventLog.created_at)
            .where(
                EventLog.user_id == user_id,
                EventLog.event_type == f"email_{event_type}",
                EventLog.created_at >= cutoff,
            )
            .order_by(EventLog.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return row is None


async def _send_brevo(to_email: str, subject: str, html: str) -> None:
    from brevo import AsyncBrevo
    from brevo.transactional_emails import (
        SendTransacEmailRequestSender,
        SendTransacEmailRequestToItem,
    )

    client = AsyncBrevo(api_key=_key())
    await client.transactional_emails.send_transac_email(
        sender=SendTransacEmailRequestSender(email=_sender_email(), name=_sender_name()),
        to=[SendTransacEmailRequestToItem(email=to_email)],
        subject=subject,
        html_content=html,
    )


async def send_email(
    db: AsyncSession,
    user_id: str,
    event_type: str,
    to_email: str,
    subject: str,
    html: str,
) -> bool:
    if not _enabled() or not _key():
        log.info("email_skip: %s user=%s (disabled/no-key)", event_type, user_id)
        return False
    if not await _should_send(db, event_type, user_id):
        log.info("email_skip: %s user=%s (cooldown)", event_type, user_id)
        return False
    from .resilience import _check_circuit, _record_failure, _record_success, retrying

    try:
        _check_circuit("brevo")
    except Exception as exc:  # noqa: BLE001
        log.warning("email_circuit_open: %s user=%s %s", event_type, user_id, exc)
        return False
    try:
        async for attempt in retrying("brevo", attempts=3):
            with attempt:
                await _send_brevo(to_email, subject, html)
        _record_success("brevo")
    except Exception:
        _record_failure("brevo")
        log.exception("email_fail: %s user=%s", event_type, user_id)
        return False
    await _note_sent(db, event_type, user_id, subject)
    log.info("email_sent: %s user=%s -> %s", event_type, user_id, to_email)
    return True


def _welcome_html(name: str | None) -> str:
    n = name or "there"
    return f"""<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
<h2 style="color:#0d9488">Welcome to BaseMind</h2>
<p>Hi {n},</p>
<p>Your account is live. Here's how to get started:</p>
<ol><li><strong>Create an agent</strong> — give it a name and instructions</li>
<li><strong>Upload knowledge</strong> — PDF, text file, or crawl a URL</li>
<li><strong>Start chatting</strong> — ask questions grounded in your data</li></ol>
<p style="margin-top:24px"><a href="https://basemind.vercel.app/agents" style="background:#0d9488;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Open Dashboard</a></p>
<p style="color:#64748b;font-size:12px;margin-top:32px">BaseMind — Knowledge Driven AI Agents</p>
</body></html>"""


def _digest_html(name: str | None, stats: dict) -> str:
    n = name or "there"
    rows = ""
    for ag in stats.get("agents", []):
        rows += f"<tr><td style='padding:8px;border-bottom:1px solid #e2e8f0'>{ag['name']}</td><td style='padding:8px;border-bottom:1px solid #e2e8f0;text-align:right'>{ag['queries']}</td><td style='padding:8px;border-bottom:1px solid #e2e8f0;text-align:right'>{ag['resolved']}</td><td style='padding:8px;border-bottom:1px solid #e2e8f0;text-align:right'>{ag['halted']}</td></tr>"
    return f"""<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
<h2 style="color:#0d9488">Daily Agent Digest</h2>
<p>Hi {n}, here's your last-24h summary:</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
<tr style="background:#f8fafc"><th style="padding:8px;text-align:left">Agent</th><th style="padding:8px;text-align:right">Queries</th><th style="padding:8px;text-align:right">Resolved</th><th style="padding:8px;text-align:right">Halted</th></tr>
{rows}
</table>
<p style="color:#64748b;font-size:12px">BaseMind — Knowledge Driven AI Agents</p>
</body></html>"""


def _rate_limit_html(agent_name: str, limit: int) -> str:
    return f"""<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
<h2 style="color:#b91c1c">Rate Limit Alert</h2>
<p>Your agent <strong>{agent_name}</strong> hit the rate limit ({limit} messages/5 min).</p>
<p>This usually means a burst of activity. The agent will resume once the window resets.</p>
<p style="color:#64748b;font-size:12px">BaseMind — Knowledge Driven AI Agents</p>
</body></html>"""


def _escalation_html(agent_name: str, visitor: str, conversation_id: str) -> str:
    v = visitor or "A website visitor"
    takeover_url = f"https://base-mind.vercel.app/chat?id={conversation_id}"
    return f"""<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f8fafc;color:#1e293b">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
<div style="display:inline-block;background:#fef3c7;border:1px solid #fcd34d;color:#b45309;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:12px">🚨 Action Required</div>
<h2 style="color:#0f172a;margin-top:0">Visitor Escalated to Human Support</h2>
<p style="font-size:14px;line-height:1.6">A visitor on your agent <strong>{agent_name}</strong> requested live human assistance. Automated bot replies have been paused on this thread.</p>
<div style="background:#f1f5f9;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;margin:20px 0;font-size:13px">
  <p style="margin:0 0 4px 0"><strong>Visitor:</strong> {v}</p>
  <p style="margin:0"><strong>Thread ID:</strong> {conversation_id}</p>
</div>
<p style="margin-top:24px"><a href="{takeover_url}" style="background:#0d9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Take Over Conversation &rarr;</a></p>
<p style="color:#94a3b8;font-size:11px;margin-top:32px">BaseMind — Human-in-the-Loop AI Customer Support</p>
</div>
</body></html>"""


def _new_lead_html(
    agent_name: str,
    name: str | None,
    email: str,
    phone: str | None,
    company: str | None,
    message: str | None,
) -> str:
    n = name or "Anonymous"
    p = phone or "Not provided"
    c = company or "Not provided"
    m = message or "No note attached"
    crm_url = "https://base-mind.vercel.app/leads"
    return f"""<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f8fafc;color:#1e293b">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
<div style="display:inline-block;background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:12px">🎉 New Lead Captured</div>
<h2 style="color:#0f172a;margin-top:0">New Lead on {agent_name}</h2>
<p style="font-size:14px;line-height:1.6">A visitor left their contact details through the chat widget on <strong>{agent_name}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
  <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;width:90px"><strong>Name:</strong></td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:500">{n}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b"><strong>Email:</strong></td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:500"><a href="mailto:{email}" style="color:#0d9488">{email}</a></td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b"><strong>Phone:</strong></td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">{p}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b"><strong>Company:</strong></td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">{c}</td></tr>
  <tr><td style="padding:8px 0;color:#64748b;vertical-align:top"><strong>Note:</strong></td><td style="padding:8px 0;line-height:1.5">{m}</td></tr>
</table>
<p style="margin-top:24px"><a href="{crm_url}" style="background:#0d9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">View in Leads CRM &rarr;</a></p>
<p style="color:#94a3b8;font-size:11px;margin-top:32px">BaseMind — AI Customer Support & Lead Conversion</p>
</div>
</body></html>"""


async def dispatch_welcome(user: "object") -> None:
    """Fire-and-forget welcome email (first agent created)."""
    if not getattr(user, "email", None):
        return
    await _dispatch(
        "welcome",
        user.id,
        user.email,
        "Welcome to BaseMind",
        _welcome_html(getattr(user, "name", None)),
    )


async def dispatch_digest(user: "object", stats: dict) -> None:
    """Fire-and-forget daily digest (lazy trigger)."""
    if not getattr(user, "email", None):
        return
    await _dispatch(
        "digest",
        user.id,
        user.email,
        "Your BaseMind agents — daily digest",
        _digest_html(getattr(user, "name", None), stats),
    )


async def dispatch_rate_limit(user: "object", agent_name: str) -> None:
    """Fire-and-forget rate-limit alert (throttled)."""
    if not getattr(user, "email", None):
        return
    await _dispatch(
        "rate_limit",
        user.id,
        user.email,
        f"Rate limit alert: {agent_name}",
        _rate_limit_html(agent_name, 20),
    )


async def dispatch_escalation_alert(
    user: "object",
    agent_name: str,
    visitor: str,
    conversation_id: str,
) -> None:
    """Fire-and-forget escalation notification to agent owner."""
    if not getattr(user, "email", None):
        return
    await _dispatch(
        "escalation",
        user.id,
        user.email,
        f"🚨 [Action Required] Visitor requested human support on {agent_name}",
        _escalation_html(agent_name, visitor, conversation_id),
    )


async def dispatch_new_lead_alert(
    user: "object",
    agent_name: str,
    name: str | None,
    email: str,
    phone: str | None,
    company: str | None,
    message: str | None,
) -> None:
    """Fire-and-forget notification to agent owner when a lead is captured."""
    if not getattr(user, "email", None):
        return
    display_title = name or email
    await _dispatch(
        "new_lead",
        user.id,
        user.email,
        f"🎉 New Lead Captured on {agent_name}: {display_title}",
        _new_lead_html(agent_name, name, email, phone, company, message),
    )


async def _dispatch(
    event_type: str,
    user_id: str,
    to_email: str,
    subject: str,
    html: str,
) -> None:
    async def _run() -> None:
        if SessionFactory is None:
            return
        async with SessionFactory() as db:
            await send_email(db, user_id, event_type, to_email, subject, html)

    asyncio.get_running_loop().create_task(_run())


async def dispatch_operator(
    db: AsyncSession,
    event_type: str,
    subject: str,
    html: str,
) -> None:
    """Send an operator alert email to all configured operator emails."""
    operator_emails_str = os.getenv("OPERATOR_EMAILS", "")
    if not operator_emails_str:
        return
    operator_emails = [e.strip() for e in operator_emails_str.split(",") if e.strip()]
    if not operator_emails:
        return
    # Use the first operator email for cooldown tracking, or send to all
    for operator_email in operator_emails:
        await _dispatch(
            event_type,
            operator_email,
            operator_email,
            subject,
            html,
        )
