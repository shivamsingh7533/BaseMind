import hashlib
import hmac
import json
import logging
import re
import time
from datetime import UTC, datetime

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..ai import embed_texts, stream_answer
from ..auth import get_current_user
from ..db import SessionFactory, get_db
from ..models import Agent, Conversation, Document, DocumentChunk, Integration, Message, User
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


async def _bg_reply_whatsapp(phone_number_id: str, bot_token: str, recipient_phone: str, reply_text: str) -> None:
    try:
        url = f"https://graph.facebook.com/v21.0/{phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient_phone,
            "type": "text",
            "text": {"body": reply_text},
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                url,
                headers={"Authorization": f"Bearer {bot_token}", "Content-Type": "application/json"},
                json=payload,
            )
            if not res.is_success:
                log.warning("WhatsApp API error %s: %s", res.status_code, res.text)
    except Exception as exc:  # noqa: BLE001
        log.exception("Failed to reply to WhatsApp: %s", exc)


async def _bg_reply_telegram(bot_token: str, chat_id: str, reply_text: str) -> None:
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": reply_text,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload)
            if not res.is_success:
                log.warning("Telegram API error %s: %s", res.status_code, res.text)
    except Exception as exc:  # noqa: BLE001
        log.exception("Failed to reply to Telegram: %s", exc)


async def _get_or_create_omnichannel_conversation(
    agent_id: str,
    user_id: str,
    channel: str,
    external_chat_id: str,
    visitor_name: str,
) -> Conversation:
    async with SessionFactory() as db:
        stmt = (
            select(Conversation)
            .where(
                Conversation.agent_id == agent_id,
                Conversation.channel == channel,
                Conversation.external_chat_id == external_chat_id,
                Conversation.status != "resolved",
            )
            .order_by(Conversation.started_at.desc())
            .limit(1)
        )
        conv = (await db.execute(stmt)).scalar_one_or_none()
        if not conv:
            conv = Conversation(
                user_id=user_id,
                agent_id=agent_id,
                visitor=visitor_name,
                channel=channel,
                external_chat_id=external_chat_id,
                status="active",
            )
            db.add(conv)
            await db.commit()
            await db.refresh(conv)
        return conv


async def _process_inbound_whatsapp(
    agent_id: str,
    user_id: str,
    phone_number_id: str,
    bot_token: str,
    sender_phone: str,
    sender_name: str,
    message_text: str,
) -> None:
    try:
        conv = await _get_or_create_omnichannel_conversation(
            agent_id=agent_id,
            user_id=user_id,
            channel="whatsapp",
            external_chat_id=sender_phone,
            visitor_name=sender_name or sender_phone,
        )

        # 1. Save visitor message
        async with SessionFactory() as db:
            user_msg = Message(
                conversation_id=conv.id,
                role="user",
                content=message_text,
            )
            c = (await db.execute(select(Conversation).where(Conversation.id == conv.id))).scalar_one()
            c.preview = message_text[:120]
            db.add(user_msg)
            await db.commit()

        # 2. Check if human operator is handling thread
        if conv.status in ("needs_human", "in_takeover"):
            log.info("Inbound WhatsApp message queued for human operator (conv %s)", conv.id)
            return

        # 3. Check natural language human escalation intent
        lower = message_text.lower()
        keywords = ["human", "agent", "person", "operator", "representative", "real person", "support team"]
        if any(kw in lower for kw in keywords):
            async with SessionFactory() as db:
                c = (await db.execute(select(Conversation).where(Conversation.id == conv.id))).scalar_one()
                c.status = "needs_human"
                c.handover_requested_at = datetime.now(UTC)
                notice = Message(
                    conversation_id=conv.id,
                    role="agent",
                    content="I have connected you to a human operator. An agent will respond to you shortly.",
                )
                db.add(notice)
                await db.commit()

            handover_text = "I've connected you to our live human support team. An operator will respond to you directly here on WhatsApp."
            await _bg_reply_whatsapp(phone_number_id, bot_token, sender_phone, handover_text)
            return

        # 4. Generate RAG answer
        reply_text = await _generate_bot_answer(agent_id, message_text)

        # 5. Store agent answer
        async with SessionFactory() as db:
            agent_msg = Message(
                conversation_id=conv.id,
                role="agent",
                content=reply_text,
            )
            c = (await db.execute(select(Conversation).where(Conversation.id == conv.id))).scalar_one()
            c.preview = reply_text[:120]
            db.add(agent_msg)
            await db.commit()

        # 6. Dispatch reply via Meta Cloud API
        await _bg_reply_whatsapp(phone_number_id, bot_token, sender_phone, reply_text)
    except Exception as exc:  # noqa: BLE001
        log.exception("Error processing inbound WhatsApp message: %s", exc)


async def _process_inbound_telegram(
    agent_id: str,
    user_id: str,
    bot_token: str,
    chat_id: str,
    sender_name: str,
    message_text: str,
) -> None:
    try:
        conv = await _get_or_create_omnichannel_conversation(
            agent_id=agent_id,
            user_id=user_id,
            channel="telegram",
            external_chat_id=chat_id,
            visitor_name=sender_name or f"Telegram User {chat_id}",
        )

        # 1. Save visitor message
        async with SessionFactory() as db:
            user_msg = Message(
                conversation_id=conv.id,
                role="user",
                content=message_text,
            )
            c = (await db.execute(select(Conversation).where(Conversation.id == conv.id))).scalar_one()
            c.preview = message_text[:120]
            db.add(user_msg)
            await db.commit()

        # 2. Check if human operator is handling thread
        if conv.status in ("needs_human", "in_takeover"):
            log.info("Inbound Telegram message queued for human operator (conv %s)", conv.id)
            return

        # 3. Check natural language human escalation intent
        lower = message_text.lower()
        keywords = ["human", "agent", "person", "operator", "representative", "real person", "support team"]
        if any(kw in lower for kw in keywords):
            async with SessionFactory() as db:
                c = (await db.execute(select(Conversation).where(Conversation.id == conv.id))).scalar_one()
                c.status = "needs_human"
                c.handover_requested_at = datetime.now(UTC)
                notice = Message(
                    conversation_id=conv.id,
                    role="agent",
                    content="I have connected you to a human operator. An agent will respond to you shortly.",
                )
                db.add(notice)
                await db.commit()

            handover_text = "I've connected you to our live human support team. An operator will respond to you directly here on Telegram."
            await _bg_reply_telegram(bot_token, chat_id, handover_text)
            return

        # 4. Generate RAG answer
        reply_text = await _generate_bot_answer(agent_id, message_text)

        # 5. Store agent answer
        async with SessionFactory() as db:
            agent_msg = Message(
                conversation_id=conv.id,
                role="agent",
                content=reply_text,
            )
            c = (await db.execute(select(Conversation).where(Conversation.id == conv.id))).scalar_one()
            c.preview = reply_text[:120]
            db.add(agent_msg)
            await db.commit()

        # 6. Dispatch reply via Telegram Bot API
        await _bg_reply_telegram(bot_token, chat_id, reply_text)
    except Exception as exc:  # noqa: BLE001
        log.exception("Error processing inbound Telegram message: %s", exc)


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

    if integ.platform == "whatsapp":
        if not integ.bot_token or not integ.channel_id:
            raise HTTPException(status_code=400, detail="WhatsApp System User Token and Phone Number ID are required to test.")
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"https://graph.facebook.com/v21.0/{integ.channel_id}",
                headers={"Authorization": f"Bearer {integ.bot_token}"},
            )
            if not res.is_success:
                data = res.json() if res.content else {}
                err_msg = data.get("error", {}).get("message", f"HTTP {res.status_code}")
                raise HTTPException(status_code=400, detail=f"WhatsApp verification failed: {err_msg}")
        return {"ok": True, "message": "WhatsApp Phone Number ID and Access Token verified with Meta Graph API!"}

    if integ.platform == "telegram":
        if not integ.bot_token:
            raise HTTPException(status_code=400, detail="Telegram Bot Token is required to test.")
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"https://api.telegram.org/bot{integ.bot_token}/getMe")
            data = res.json()
            if not data.get("ok"):
                raise HTTPException(status_code=400, detail=f"Telegram Bot error: {data.get('description', 'invalid token')}")
            bot_name = data.get("result", {}).get("username", "bot")
        return {"ok": True, "message": f"Telegram Bot verified successfully (@{bot_name})!"}

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


# ---------------------------------------------------------------------------
# WhatsApp Cloud API Webhook Handlers
# ---------------------------------------------------------------------------
@router.get("/api/integrations/whatsapp/{agent_id}")
async def verify_whatsapp_webhook(
    agent_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Meta Webhook Verification Handshake.

    Meta calls this GET endpoint with hub.mode, hub.verify_token, and hub.challenge
    when configuring the Webhook in Meta App Dashboard.
    """
    hub_mode = request.query_params.get("hub.mode")
    hub_challenge = request.query_params.get("hub.challenge")
    hub_verify_token = request.query_params.get("hub.verify_token")

    if not hub_mode or not hub_verify_token:
        raise HTTPException(status_code=400, detail="Missing hub.mode or hub.verify_token")

    integ = (
        await db.execute(
            select(Integration).where(
                Integration.agent_id == agent_id,
                Integration.platform == "whatsapp",
                Integration.status == "active",
            )
        )
    ).scalar_one_or_none()

    if not integ or not integ.signing_secret:
        raise HTTPException(status_code=404, detail="WhatsApp integration not found for this agent")

    if hub_mode == "subscribe" and hub_verify_token == integ.signing_secret:
        return Response(content=hub_challenge or "", media_type="text/plain")

    raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/api/integrations/whatsapp/{agent_id}")
async def handle_whatsapp_webhook(
    agent_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Processes inbound visitor messages from WhatsApp Cloud API."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    integ = (
        await db.execute(
            select(Integration).where(
                Integration.agent_id == agent_id,
                Integration.platform == "whatsapp",
                Integration.status == "active",
            )
        )
    ).scalar_one_or_none()

    if not integ or not integ.bot_token:
        return {"status": "ignored_no_integration"}

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            val = change.get("value", {})
            metadata = val.get("metadata", {})
            phone_number_id = integ.channel_id or metadata.get("phone_number_id", "")
            contacts = {c.get("wa_id"): c.get("profile", {}).get("name") for c in val.get("contacts", [])}
            for msg in val.get("messages", []):
                sender_phone = msg.get("from")
                sender_name = contacts.get(sender_phone) or sender_phone or "WhatsApp User"
                msg_type = msg.get("type")
                raw_text = msg.get("text")
                if isinstance(raw_text, dict):
                    message_text = raw_text.get("body", "")
                elif isinstance(raw_text, str):
                    message_text = raw_text
                elif msg_type == "image":
                    raw_img = msg.get("image", {})
                    caption = raw_img.get("caption", "") if isinstance(raw_img, dict) else ""
                    message_text = f"[Image Attached] {caption}".strip()
                else:
                    message_text = ""

                if sender_phone and message_text:
                    background_tasks.add_task(
                        _process_inbound_whatsapp,
                        agent_id=agent_id,
                        user_id=integ.user_id,
                        phone_number_id=phone_number_id,
                        bot_token=integ.bot_token,
                        sender_phone=sender_phone,
                        sender_name=sender_name,
                        message_text=message_text,
                    )

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Telegram Bot API Webhook Handlers
# ---------------------------------------------------------------------------
@router.post("/api/integrations/telegram/{agent_id}")
async def handle_telegram_webhook(
    agent_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Processes inbound Telegram updates (messages/photos)."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    integ = (
        await db.execute(
            select(Integration).where(
                Integration.agent_id == agent_id,
                Integration.platform == "telegram",
                Integration.status == "active",
            )
        )
    ).scalar_one_or_none()

    if not integ or not integ.bot_token:
        return {"status": "ignored_no_integration"}

    msg = body.get("message") or body.get("edited_message")
    if msg and "chat" in msg:
        chat_id = str(msg["chat"]["id"])
        from_user = msg.get("from", {})
        first_name = from_user.get("first_name", "")
        last_name = from_user.get("last_name", "")
        username = from_user.get("username", "")
        display_name = f"{first_name} {last_name}".strip() or username or f"Telegram User {chat_id}"

        message_text = msg.get("text", "")
        if not message_text and msg.get("photo"):
            message_text = f"[Photo Attached] {msg.get('caption', '')}".strip()

        if message_text:
            background_tasks.add_task(
                _process_inbound_telegram,
                agent_id=agent_id,
                user_id=integ.user_id,
                bot_token=integ.bot_token,
                chat_id=chat_id,
                sender_name=display_name,
                message_text=message_text,
            )

    return {"ok": True}


@router.post("/api/agents/{agent_id}/integrations/{integration_id}/set-telegram-webhook")
async def set_telegram_webhook(
    agent_id: str,
    integration_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registers the BaseMind webhook URL directly with Telegram Bot API."""
    await _get_owned(db, Agent, agent_id, user)
    integ = (
        await db.execute(
            select(Integration).where(
                Integration.id == integration_id,
                Integration.agent_id == agent_id,
                Integration.platform == "telegram",
            )
        )
    ).scalar_one_or_none()

    if not integ or not integ.bot_token:
        raise HTTPException(status_code=400, detail="Telegram Bot Token is required.")

    webhook_url = integ.webhook_url
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Webhook URL is required.")

    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.post(
            f"https://api.telegram.org/bot{integ.bot_token}/setWebhook",
            json={"url": webhook_url},
        )
        data = res.json() if res.content else {}
        if not data.get("ok"):
            raise HTTPException(status_code=400, detail=f"Telegram error: {data.get('description', 'failed')}")

    return {"ok": True, "message": "Telegram webhook set successfully!"}
