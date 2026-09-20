import fnmatch
import json
from datetime import UTC, datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..ai import embed_texts, stream_answer
from ..cache import invalidate_user_cache
from ..db import SessionFactory, get_db
from ..models import Agent, Conversation, Document, DocumentChunk, Lead, Message, User
from ..schemas import (
    LeadCreate,
    MessageFeedbackIn,
    MessageIn,
    serialize_conversation,
    serialize_lead,
    serialize_message,
)
from .deps import _allow_chat_async, _allow_rate_limited_async, log

router = APIRouter(prefix="/api/public", tags=["public"])


class PublicConversationCreate(BaseModel):
    visitor: str = Field(default="Guest", max_length=120)


def _is_origin_allowed(origin: str, allowed: str) -> bool:
    if not allowed or not allowed.strip():
        return True
    parsed = urlparse(origin)
    host = (parsed.netloc or parsed.path).split(":")[0].lower()
    allowed_list = [d.strip().lower() for d in allowed.split(",") if d.strip()]
    for pat in allowed_list:
        if pat == "*" or pat == host:
            return True
        if pat.startswith("*.") and (host == pat[2:] or host.endswith(pat[1:])):
            return True
        if fnmatch.fnmatch(host, pat):
            return True
    return False


@router.get("/agents/{agent_id}")
async def get_public_agent(
    agent_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None or agent.status != "active":
        raise HTTPException(status_code=404, detail="Agent not found or currently inactive")

    owner = (await db.execute(select(User).where(User.id == agent.user_id))).scalar_one_or_none()
    if owner is None or getattr(owner, "platform_status", "active") != "active":
        raise HTTPException(status_code=403, detail="Agent is temporarily unavailable")

    if agent.allowed_domains and request is not None:
        origin = request.headers.get("origin") or request.headers.get("referer") or ""
        if origin and not _is_origin_allowed(origin, agent.allowed_domains):
            raise HTTPException(status_code=403, detail="Domain not authorized to embed this agent")

    raw_sq = agent.suggested_questions or "[]"
    try:
        suggested = json.loads(raw_sq) if isinstance(raw_sq, str) else raw_sq
    except Exception:
        suggested = []

    return {
        "id": agent.id,
        "name": agent.name,
        "color": agent.color or "#0d9488",
        "greetingMessage": agent.greeting_message or "Hi! How can I help you today?",
        "suggestedQuestions": suggested,
        "leadCaptureEnabled": bool(agent.lead_capture_enabled),
        "leadCaptureTitle": agent.lead_capture_title or "Get in touch",
        "hideBranding": bool(getattr(agent, "hide_branding", False)),
        "customBrandName": getattr(agent, "custom_brand_name", "") or "",
        "status": agent.status,
    }


@router.post("/agents/{agent_id}/leads", status_code=201)
async def submit_public_lead(
    agent_id: str,
    payload: LeadCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = (request.client.host if request.client else "unknown")
    if not await _allow_rate_limited_async("pub_lead", client_ip, 10, 3600.0):
        raise HTTPException(status_code=429, detail="Too many submissions. Please try again later.")

    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None or agent.status != "active":
        raise HTTPException(status_code=404, detail="Agent not found or inactive")

    if agent.allowed_domains:
        origin = request.headers.get("origin") or request.headers.get("referer") or ""
        if origin and not _is_origin_allowed(origin, agent.allowed_domains):
            raise HTTPException(status_code=403, detail="Domain not authorized to embed this agent")

    lead = Lead(
        user_id=agent.user_id,
        agent_id=agent.id,
        conversation_id=payload.conversation_id,
        name=payload.name,
        email=payload.email.strip().lower(),
        phone=payload.phone,
        company=payload.company,
        message=payload.message,
        status="new",
    )
    db.add(lead)

    if payload.conversation_id and payload.name:
        conv = (await db.execute(select(Conversation).where(Conversation.id == payload.conversation_id))).scalar_one_or_none()
        if conv:
            conv.visitor = payload.name

    await db.commit()
    await db.refresh(lead)

    owner = (await db.execute(select(User).where(User.id == agent.user_id))).scalar_one_or_none()
    if owner:
        from ..email import dispatch_new_lead_alert

        await dispatch_new_lead_alert(
            owner,
            agent.name,
            lead.name,
            lead.email,
            lead.phone,
            lead.company,
            lead.message,
        )

    return serialize_lead(lead, agent.name)


@router.post("/agents/{agent_id}/conversations", status_code=201)
async def create_public_conversation(
    agent_id: str,
    payload: PublicConversationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = (request.client.host if request.client else "unknown")
    if not await _allow_rate_limited_async("pub_conv", client_ip, 15, 60.0):
        raise HTTPException(status_code=429, detail="Too many conversations created, please slow down.")

    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None or agent.status != "active":
        raise HTTPException(status_code=404, detail="Agent not found or inactive")

    owner = (await db.execute(select(User).where(User.id == agent.user_id))).scalar_one_or_none()
    if owner is None or getattr(owner, "platform_status", "active") != "active":
        raise HTTPException(status_code=403, detail="Agent unavailable")

    conv = Conversation(
        user_id=agent.user_id,
        agent_id=agent.id,
        visitor=payload.visitor or "Visitor",
        status="active",
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv, attribute_names=["messages"])
    return {
        "id": conv.id,
        "visitor": conv.visitor,
        "agentId": agent.id,
    }


@router.get("/conversations/{conversation_id}")
async def get_public_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return serialize_conversation(conv, with_messages=True)


def _is_handover_intent(text: str) -> bool:
    low = text.lower().strip()
    phrases = [
        "talk to a person",
        "talk to person",
        "talk to human",
        "talk to a human",
        "speak to a human",
        "speak to human",
        "speak to an agent",
        "speak to agent",
        "human agent",
        "live agent",
        "real person",
        "human operator",
        "talk to operator",
        "transfer to agent",
        "transfer to human",
        "connect me to a person",
        "connect to human",
        "connect to agent",
        "customer representative",
        "support representative",
        "human support",
    ]
    return any(p in low for p in phrases)


@router.post("/conversations/{conversation_id}/handover")
async def request_public_handover(
    conversation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    if not await _allow_rate_limited_async("pub_handover", client_ip, 10, 60.0):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment.")

    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if conv is None or conv.status in ("resolved", "halted"):
        raise HTTPException(status_code=404, detail="Conversation not found or closed")

    now = datetime.now(UTC)
    conv.status = "needs_human"
    conv.handover_requested_at = now

    notice = Message(
        conversation_id=conv.id,
        role="agent",
        content="Human agent requested. An operator has been notified and will be with you shortly.",
    )
    conv.preview = notice.content[:120]
    db.add(notice)
    await db.commit()
    await db.refresh(conv, attribute_names=["messages"])
    await invalidate_user_cache(conv.user_id)

    owner = (await db.execute(select(User).where(User.id == conv.user_id))).scalar_one_or_none()
    agent_title = "Support Agent"
    if conv.agent_id:
        agent_obj = (await db.execute(select(Agent).where(Agent.id == conv.agent_id))).scalar_one_or_none()
        if agent_obj:
            agent_title = agent_obj.name
    if owner:
        from ..email import dispatch_escalation_alert

        await dispatch_escalation_alert(
            user=owner,
            agent_name=agent_title,
            visitor=conv.visitor,
            conversation_id=conv.id,
        )

    return {
        "status": "needs_human",
        "handoverRequestedAt": conv.handover_requested_at.isoformat() if conv.handover_requested_at else None,
        "message": notice.content,
    }


@router.post("/conversations/{conversation_id}/chat")
async def public_chat(
    conversation_id: str,
    payload: MessageIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if payload.role != "user":
        raise HTTPException(status_code=422, detail="role must be 'user'")

    client_ip = (request.client.host if request.client else "unknown")
    if not await _allow_rate_limited_async("pub_chat", client_ip, 20, 60.0):
        raise HTTPException(status_code=429, detail="Chat rate limit exceeded. Please wait a moment.")

    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if conv is None or conv.status not in ("active", "needs_human", "in_takeover"):
        raise HTTPException(status_code=404, detail="Conversation not found or inactive")

    agent_row = None
    if conv.agent_id:
        agent_row = (await db.execute(select(Agent).where(Agent.id == conv.agent_id))).scalar_one_or_none()
        if not agent_row or agent_row.status != "active":
            raise HTTPException(status_code=404, detail="Agent is no longer active")

    if not await _allow_chat_async(conv.user_id):
        raise HTTPException(status_code=429, detail="Agent message capacity reached for this minute. Please wait a moment.")

    visitor_message = Message(conversation_id=conv.id, role="user", content=payload.text)
    conv.preview = payload.text[:120]
    db.add(visitor_message)
    await db.commit()
    await db.refresh(visitor_message)
    await invalidate_user_cache(conv.user_id)

    if conv.status in ("needs_human", "in_takeover"):
        assigned_name = conv.assigned_to or "an operator"
        info_msg = (
            f"Your message was received by {assigned_name}."
            if conv.status == "in_takeover"
            else "Your request is queued for a human operator. They will respond shortly."
        )

        async def live_handover_stream():
            yield f"data: {json.dumps({'type': 'handover', 'status': conv.status, 'assignedTo': conv.assigned_to, 'message': info_msg})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(live_handover_stream(), media_type="text/event-stream")

    if _is_handover_intent(payload.text):
        conv.status = "needs_human"
        conv.handover_requested_at = datetime.now(UTC)
        escalation_notice = Message(
            conversation_id=conv.id,
            role="agent",
            content="I've escalated your request to a human operator. Someone will take over shortly.",
        )
        conv.preview = escalation_notice.content[:120]
        db.add(escalation_notice)
        await db.commit()
        await db.refresh(escalation_notice)
        await invalidate_user_cache(conv.user_id)

        owner = (await db.execute(select(User).where(User.id == conv.user_id))).scalar_one_or_none()
        agent_title = agent_row.name if agent_row else "Support Agent"
        if owner:
            from ..email import dispatch_escalation_alert

            await dispatch_escalation_alert(
                user=owner,
                agent_name=agent_title,
                visitor=conv.visitor,
                conversation_id=conv.id,
            )

        async def intent_handover_stream():
            yield f"data: {json.dumps({'type': 'token', 'token': escalation_notice.content})}\n\n"
            yield f"data: {json.dumps({'type': 'handover', 'status': 'needs_human', 'message': escalation_notice.content})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'messageId': escalation_notice.id})}\n\n"

        return StreamingResponse(intent_handover_stream(), media_type="text/event-stream")

    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id, Message.id != visitor_message.id)
        .order_by(Message.created_at.desc())
        .limit(6)
    )
    recent = list(reversed(msg_result.scalars().all()))
    history = [{"role": "model" if m.role == "agent" else "user", "content": m.content} for m in recent]

    query_embedding = (await embed_texts([payload.text]))[0]

    search = select(DocumentChunk, Document.name).join(Document, DocumentChunk.document_id == Document.id)
    search = search.where(DocumentChunk.user_id == conv.user_id)
    if conv.agent_id:
        search = search.where((DocumentChunk.agent_id == conv.agent_id) | (DocumentChunk.agent_id.is_(None)))
    search = search.order_by(DocumentChunk.embedding.cosine_distance(query_embedding)).limit(4)
    matches = (await db.execute(search)).all()
    contexts = [
        {
            "source": name,
            "docId": chunk.document_id,
            "index": chunk.chunk_index,
            "content": chunk.content,
        }
        for chunk, name in matches
    ]

    agent_instructions = agent_row.instructions if agent_row else ""
    agent_id_value = conv.agent_id
    conversation_id_value = conv.id
    question = payload.text

    async def event_stream():
        answer_parts: list[str] = []
        sources_line = json.dumps(
            {
                "type": "sources",
                "sources": [{"docId": c["docId"], "source": c["source"]} for c in contexts],
            }
        )
        yield f"data: {sources_line}\n\n"
        saved_message_id: str | None = None
        try:
            async for token in stream_answer(
                question,
                contexts,
                history=history,
                extra_instructions=agent_instructions,
            ):
                answer_parts.append(token)
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

            full_answer = "".join(answer_parts).strip()
            if full_answer and SessionFactory:
                try:
                    async with SessionFactory() as final_session:
                        new_msg = Message(
                            conversation_id=conversation_id_value,
                            role="agent",
                            content=full_answer,
                            sources=json.dumps(
                                [{"docId": c["docId"], "source": c["source"]} for c in contexts]
                            ),
                        )
                        final_session.add(new_msg)
                        if agent_id_value:
                            await final_session.execute(
                                update(Agent)
                                .where(Agent.id == agent_id_value)
                                .values(queries_24h=Agent.queries_24h + 1)
                            )
                        await final_session.commit()
                        await final_session.refresh(new_msg)
                        saved_message_id = new_msg.id

                        # If 0 chunks matched, automatically record an unresolved knowledge gap
                        if len(contexts) == 0:
                            from .analytics import record_knowledge_gap

                            await record_knowledge_gap(
                                db=final_session,
                                user_id=conv.user_id,
                                agent_id=agent_id_value,
                                conversation_id=conversation_id_value,
                                query=question,
                                reason="no_contexts_found",
                                response_snippet=full_answer,
                            )
                except Exception:
                    log.exception("public_chat_persist_failed", conversation_id=conversation_id_value)

            done_data = {"type": "done"}
            if saved_message_id:
                done_data["messageId"] = saved_message_id
            yield f"data: {json.dumps(done_data)}\n\n"
        except Exception as e:
            log.exception("public_chat_stream_failed", error=str(e), conversation_id=conversation_id_value)
            yield f"data: {json.dumps({'type': 'error', 'error': 'Failed to complete response'})}\n\n"
        finally:
            if not saved_message_id:
                fallback_answer = "".join(answer_parts).strip()
                if fallback_answer and SessionFactory:
                    try:
                        async with SessionFactory() as final_session:
                            final_session.add(
                                Message(
                                    conversation_id=conversation_id_value,
                                    role="agent",
                                    content=fallback_answer,
                                    sources=json.dumps(
                                        [{"docId": c["docId"], "source": c["source"]} for c in contexts]
                                    ),
                                )
                            )
                            if agent_id_value:
                                await final_session.execute(
                                    update(Agent)
                                    .where(Agent.id == agent_id_value)
                                    .values(queries_24h=Agent.queries_24h + 1)
                                )
                            await final_session.commit()
                    except Exception:
                        log.exception("public_chat_fallback_persist_failed", conversation_id=conversation_id_value)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/messages/{message_id}/feedback")
async def submit_public_message_feedback(
    message_id: str,
    payload: MessageFeedbackIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Submit rating and feedback for an assistant message from the public widget."""
    client_ip = request.client.host if request.client else "unknown"
    if not await _allow_rate_limited_async("pub_feedback", client_ip, 30, 60.0):
        raise HTTPException(status_code=429, detail="Too many feedback submissions. Please slow down.")

    msg = (
        await db.execute(
            select(Message)
            .options(selectinload(Message.conversation))
            .where(Message.id == message_id)
        )
    ).scalar_one_or_none()

    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    if msg.role != "agent":
        raise HTTPException(status_code=400, detail="Only assistant messages can be rated")

    msg.rating = payload.rating
    if payload.reason:
        msg.feedback_reason = payload.reason
    if payload.comment:
        msg.feedback_reason = (
            f"{payload.reason or 'other'}: {payload.comment}"
            if payload.reason
            else payload.comment
        )

    # If negative feedback (-1), automatically record or update knowledge gap
    if payload.rating == -1 and msg.conversation:
        prev_user_msg = (
            await db.execute(
                select(Message)
                .where(
                    Message.conversation_id == msg.conversation_id,
                    Message.role == "user",
                    Message.created_at <= msg.created_at,
                )
                .order_by(Message.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        query_text = prev_user_msg.content if prev_user_msg else (msg.conversation.preview or "Unspecified query")
        from .analytics import record_knowledge_gap

        await record_knowledge_gap(
            db=db,
            user_id=msg.conversation.user_id,
            agent_id=msg.conversation.agent_id,
            conversation_id=msg.conversation.id,
            query=query_text,
            reason=payload.reason or "negative_feedback",
            matched_context=msg.sources,
            response_snippet=msg.content,
        )

    if msg.conversation:
        if payload.rating == 1:
            msg.conversation.sentiment = "positive"
            msg.conversation.csat_score = 5
        elif payload.rating == -1:
            msg.conversation.sentiment = "negative"
            msg.conversation.csat_score = 1
        await invalidate_user_cache(msg.conversation.user_id)

    await db.commit()
    await db.refresh(msg)
    return serialize_message(msg)
