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
    try:
        await _send_brevo(to_email, subject, html)
    except Exception:
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
