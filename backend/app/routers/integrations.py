import hashlib
import hmac
import json
import logging
import re
import time

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..ai import embed_texts, stream_answer
from ..auth import get_current_user
from ..db import SessionFactory, get_db
from ..models import Agent, Document, DocumentChunk, Integration, User
from ..schemas import IntegrationCreate, serialize_integration
from .deps import _get_owned

log = logging.getLogger("basemind.integrations")

router = APIRouter(tags=["integrations"])


# ---------------------------------------------------------------------------
# RAG Helper for Chatbot Replies
# ---------------------------------------------------------------------------
async def _generate_bot_answer(agent_id: str, prompt: str) -> str:
    async with SessionFactory() as db:
        agent = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()
        if not agent:
            return "Sorry, this agent is not available."

        embeddings = await embed_texts([prompt])
        if not embeddings:
            return "Sorry, I could not process your question."
        query_embedding = embeddings[0]

        search = (
            select(DocumentChunk, Document.name)
            .join(Document, DocumentChunk.document_id == Document.id)
            .where((DocumentChunk.agent_id == agent.id) | (DocumentChunk.agent_id.is_(None)))
            .where(DocumentChunk.user_id == agent.user_id)
            .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
            .limit(4)
        )
        results = (await db.execute(search)).all()

        contexts = [
            {
                "docId": chunk.document_id,
                "source": doc_name,
                "index": chunk.chunk_index,
                "content": chunk.content,
            }
            for chunk, doc_name in results
        ]

        chunks = [
            chunk
            async for chunk in stream_answer(
                question=prompt,
                contexts=contexts,
                history=[],
                extra_instructions=agent.instructions or "",
            )
        ]
        return "".join(chunks).strip() or "I could not find an answer in my knowledge base."


# ---------------------------------------------------------------------------
# Background Dispatchers
# ---------------------------------------------------------------------------
async def _bg_reply_slack(agent_id: str, bot_token: str, channel: str, thread_ts: str | None, prompt: str) -> None:
    try:
        reply_text = await _generate_bot_answer(agent_id, prompt)
        payload: dict = {
            "channel": channel,
            "text": reply_text,
        }
        if thread_ts:
            payload["thread_ts"] = thread_ts

        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {bot_token}", "Content-Type": "application/json"},
                json=payload,
            )
            if not res.is_success:
                log.warning("Slack postMessage returned %s: %s", res.status_code, res.text)
    except Exception as exc:  # noqa: BLE001
        log.exception("Failed to reply to Slack: %s", exc)


async def _bg_reply_discord(
    agent_id: str,
    webhook_url: str | None,
    bot_token: str | None,
    channel_id: str | None,
    prompt: str,
) -> None:
    try:
        reply_text = await _generate_bot_answer(agent_id, prompt)
        async with httpx.AsyncClient(timeout=15.0) as client:
            if webhook_url:
                await client.post(webhook_url, json={"content": reply_text})
            elif bot_token and channel_id:
                await client.post(
                    f"https://discord.com/api/v10/channels/{channel_id}/messages",
                    headers={"Authorization": f"Bot {bot_token}", "Content-Type": "application/json"},
                    json={"content": reply_text},
                )
    except Exception as exc:  # noqa: BLE001
        log.exception("Failed to reply to Discord: %s", exc)


# ---------------------------------------------------------------------------
# Management Endpoints
# ---------------------------------------------------------------------------
@router.get("/api/agents/{agent_id}/integrations")
async def list_agent_integrations(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned(db, Agent, agent_id, user)
    stmt = select(Integration).where(Integration.agent_id == agent_id).order_by(Integration.created_at.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return [serialize_integration(i) for i in rows]


@router.post("/api/agents/{agent_id}/integrations", status_code=200)
async def upsert_agent_integration(
    agent_id: str,
    payload: IntegrationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned(db, Agent, agent_id, user)

    stmt = select(Integration).where(Integration.agent_id == agent_id, Integration.platform == payload.platform)
    integ = (await db.execute(stmt)).scalar_one_or_none()

    if integ is None:
        integ = Integration(
            user_id=user.id,
            agent_id=agent_id,
            platform=payload.platform,
            bot_token=payload.bot_token,
            signing_secret=payload.signing_secret,
            webhook_url=payload.webhook_url,
            channel_id=payload.channel_id,
            status="active",
        )
        db.add(integ)
    else:
        if payload.bot_token is not None:
            integ.bot_token = payload.bot_token
        if payload.signing_secret is not None:
            integ.signing_secret = payload.signing_secret
        if payload.webhook_url is not None:
            integ.webhook_url = payload.webhook_url
        if payload.channel_id is not None:
            integ.channel_id = payload.channel_id
        integ.status = "active"

    await db.commit()
    await db.refresh(integ)
    return serialize_integration(integ)


@router.delete("/api/agents/{agent_id}/integrations/{integration_id}", status_code=204)
async def delete_agent_integration(
    agent_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned(db, Agent, agent_id, user)
    integ = (
        await db.execute(
            select(Integration).where(
                Integration.id == integration_id,
                Integration.agent_id == agent_id,
                Integration.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if integ is None:
        raise HTTPException(status_code=404, detail="Integration not found")

    await db.delete(integ)
    await db.commit()


@router.post("/api/agents/{agent_id}/integrations/{integration_id}/test")
async def trigger_integration_test(
    agent_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await _get_owned(db, Agent, agent_id, user)
    integ = (
        await db.execute(
            select(Integration).where(
                Integration.id == integration_id,
                Integration.agent_id == agent_id,
                Integration.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if integ is None:
        raise HTTPException(status_code=404, detail="Integration not found")

    test_msg = f" BaseMind Bot Connected: '{agent.name}' is ready to answer questions!"

    if integ.platform == "slack":
        if not integ.bot_token or not integ.channel_id:
            raise HTTPException(status_code=400, detail="Slack Bot Token and Channel ID are required to test.")
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {integ.bot_token}"},
                json={"channel": integ.channel_id, "text": test_msg},
            )
            data = res.json()
            if not data.get("ok"):
                raise HTTPException(status_code=400, detail=f"Slack API error: {data.get('error', 'unknown')}")
        return {"ok": True, "message": "Slack test message delivered!"}

    if integ.platform == "discord":
        if integ.webhook_url:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(integ.webhook_url, json={"content": test_msg})
                if not res.is_success:
                    raise HTTPException(status_code=400, detail=f"Discord Webhook error: HTTP {res.status_code}")
            return {"ok": True, "message": "Discord test message delivered!"}
        if integ.bot_token and integ.channel_id:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"https://discord.com/api/v10/channels/{integ.channel_id}/messages",
                    headers={"Authorization": f"Bot {integ.bot_token}"},
                    json={"content": test_msg},
                )
                if not res.is_success:
                    raise HTTPException(status_code=400, detail=f"Discord Bot error: HTTP {res.status_code}")
            return {"ok": True, "message": "Discord test message delivered!"}
        raise HTTPException(status_code=400, detail="Discord Webhook URL or Bot Token + Channel ID is required to test.")

    raise HTTPException(status_code=400, detail=f"Unsupported platform: {integ.platform}")


# ---------------------------------------------------------------------------
# Webhook Handlers (Slack & Discord)
# ---------------------------------------------------------------------------
@router.post("/api/integrations/slack/{agent_id}")
async def handle_slack_webhook(
    agent_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    body_bytes = await request.body()
    try:
        data = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        data = {}

    # 1. Handle URL Verification Challenge (Slack Setup)
    if data.get("type") == "url_verification":
        return {"challenge": data.get("challenge", "")}

    # 2. Look up integration
    integ = (
        await db.execute(
            select(Integration).where(
                Integration.agent_id == agent_id,
                Integration.platform == "slack",
                Integration.status == "active",
            )
        )
    ).scalar_one_or_none()
    if integ is None:
        raise HTTPException(status_code=404, detail="Slack integration not found for this agent")

    # 3. Verify HMAC-SHA256 Signature
    if integ.signing_secret:
        timestamp = request.headers.get("x-slack-request-timestamp", "")
        signature = request.headers.get("x-slack-signature", "")
        if not timestamp or not signature:
            raise HTTPException(status_code=401, detail="Missing Slack signature headers")
        if abs(time.time() - float(timestamp)) > 300:
            raise HTTPException(status_code=401, detail="Slack request timestamp expired")

        sig_basestring = f"v0:{timestamp}:{body_bytes.decode('utf-8')}".encode()
        expected_sig = (
            "v0="
            + hmac.new(integ.signing_secret.encode(), sig_basestring, hashlib.sha256).hexdigest()
        )
        if not hmac.compare_digest(expected_sig, signature):
            raise HTTPException(status_code=401, detail="Invalid Slack signature")

    # 4. Handle Event Callback
    if data.get("type") == "event_callback":
        event = data.get("event", {})
        # Ignore bot loop
        if event.get("bot_id") or event.get("subtype") == "bot_message":
            return {"ok": True}

        raw_text = event.get("text", "")
        clean_text = re.sub(r"<@[A-Z0-9]+>", "", raw_text).strip()
        channel = event.get("channel")
        thread_ts = event.get("thread_ts") or event.get("ts")

        if clean_text and channel and integ.bot_token:
            background_tasks.add_task(
                _bg_reply_slack,
                agent_id=agent_id,
                bot_token=integ.bot_token,
                channel=channel,
                thread_ts=thread_ts,
                prompt=clean_text,
            )

    return {"ok": True}


@router.post("/api/integrations/discord/{agent_id}")
async def handle_discord_webhook(
    agent_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    body_bytes = await request.body()

    integ = (
        await db.execute(
            select(Integration).where(
                Integration.agent_id == agent_id,
                Integration.platform == "discord",
                Integration.status == "active",
            )
        )
    ).scalar_one_or_none()
    if integ is None:
        raise HTTPException(status_code=404, detail="Discord integration not found for this agent")

    # 1. Verify Ed25519 Signature
    if integ.signing_secret:
        signature_hex = request.headers.get("x-signature-ed25519", "")
        timestamp = request.headers.get("x-signature-timestamp", "")
        if not signature_hex or not timestamp:
            raise HTTPException(status_code=401, detail="Missing Discord signature headers")

        try:
            public_key_bytes = bytes.fromhex(integ.signing_secret)
            pub_key = Ed25519PublicKey.from_public_bytes(public_key_bytes)
            pub_key.verify(bytes.fromhex(signature_hex), timestamp.encode("utf-8") + body_bytes)
        except (InvalidSignature, ValueError) as exc:
            raise HTTPException(status_code=401, detail="Invalid Discord signature") from exc

    try:
        data = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        data = {}

    # 2. PING interaction (Type 1)
    if data.get("type") == 1:
        return {"type": 1}

    # 3. Application Command Interaction (Type 2) or Mention
    user_prompt = ""
    if data.get("type") == 2:
        options = data.get("data", {}).get("options", [])
        for opt in options:
            if opt.get("value"):
                user_prompt = str(opt.get("value"))
                break

    if not user_prompt:
        user_prompt = data.get("content", "")

    if user_prompt:
        background_tasks.add_task(
            _bg_reply_discord,
            agent_id=agent_id,
            webhook_url=integ.webhook_url,
            bot_token=integ.bot_token,
            channel_id=integ.channel_id or data.get("channel_id"),
            prompt=user_prompt,
        )

    # For Discord Interactions, acknowledge deferred or immediate
    if data.get("type") == 2:
        return {
            "type": 5,  # DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        }

    return {"ok": True}
