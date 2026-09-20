import json
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..ai import embed_texts, stream_answer
from ..auth import get_current_user
from ..cache import cache_get, cache_set, invalidate_user_cache
from ..db import SessionFactory, get_db
from ..email import dispatch_rate_limit
from ..models import Agent, Conversation, Document, DocumentChunk, EventLog, Message, User
from ..schemas import ConversationCreate, ConversationUpdate, MessageIn, serialize_conversation
from .deps import CHAT_RATE_MAX, CHAT_RATE_WINDOW_SECONDS, _allow_chat_async, _get_owned, log

router = APIRouter(prefix="/api")


@router.get("/conversations")
async def list_conversations(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cache_key = f"convs:{user.id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.started_at.desc())
    )
    payload = [serialize_conversation(c) for c in result.scalars()]
    await cache_set(cache_key, payload)
    return payload


@router.post("/conversations", status_code=201)
async def create_conversation(
    payload: ConversationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = Conversation(user_id=user.id, visitor=payload.visitor, agent_id=payload.agent_id)
    db.add(conv)
    await db.commit()
    await db.refresh(conv, attribute_names=["messages"])
    await invalidate_user_cache(user.id)
    return serialize_conversation(conv)


@router.get("/conversations/{conversation_id}")
async def conversation_detail(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail="Not found")
    return serialize_conversation(conv, with_messages=True)


@router.post("/conversations/{conversation_id}/messages", status_code=201)
async def add_message(
    conversation_id: str,
    payload: MessageIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_owned(db, Conversation, conversation_id, user)
    sender = payload.sender_name or (user.name or user.email if payload.role == "operator" else None)
    message = Message(
        conversation_id=conv.id,
        role=payload.role,
        content=payload.text,
        sender_name=sender,
    )
    conv.preview = payload.text[:120]
    if payload.role == "operator":
        if conv.status == "needs_human":
            conv.status = "in_takeover"
        if not conv.assigned_to:
            conv.assigned_to = user.name or user.email or "Operator"
    db.add(message)
    await db.commit()
    await db.refresh(message)
    await invalidate_user_cache(user.id)
    return {
        "id": message.id,
        "role": message.role,
        "text": message.content,
        "senderName": message.sender_name,
        "time": "",
    }


@router.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    payload: ConversationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_owned(db, Conversation, conversation_id, user)
    fields = payload.model_dump(exclude_unset=True)
    for field, value in fields.items():
        setattr(conv, field, value)
    if payload.status in ("resolved", "halted") and "duration_seconds" not in fields and conv.started_at:
        started = conv.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        conv.duration_seconds = int((datetime.now(UTC) - started).total_seconds())
    await db.commit()
    await db.refresh(conv, attribute_names=["messages"])
    await invalidate_user_cache(user.id)
    return serialize_conversation(conv)


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_owned(db, Conversation, conversation_id, user)
    await db.delete(conv)
    await db.commit()
    await invalidate_user_cache(user.id)


@router.post("/conversations/{conversation_id}/takeover")
async def takeover_conversation(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_owned(db, Conversation, conversation_id, user)
    operator_name = user.name or user.email or "Human Support"
    conv.status = "in_takeover"
    conv.assigned_to = operator_name
    notice = Message(
        conversation_id=conv.id,
        role="operator",
        sender_name=operator_name,
        content=f"👋 {operator_name} has taken over the conversation.",
    )
    conv.preview = notice.content[:120]
    db.add(notice)
    await db.commit()
    await db.refresh(conv, attribute_names=["messages"])
    await invalidate_user_cache(user.id)
    return serialize_conversation(conv, with_messages=True)


@router.post("/conversations/{conversation_id}/return-to-ai")
async def return_conversation_to_ai(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_owned(db, Conversation, conversation_id, user)
    conv.status = "active"
    conv.assigned_to = None
    conv.handover_requested_at = None
    notice = Message(
        conversation_id=conv.id,
        role="agent",
        content="🤖 Operator has returned this conversation back to the AI Assistant.",
    )
    conv.preview = notice.content[:120]
    db.add(notice)
    await db.commit()
    await db.refresh(conv, attribute_names=["messages"])
    await invalidate_user_cache(user.id)
    return serialize_conversation(conv, with_messages=True)


@router.post("/conversations/{conversation_id}/chat")
async def chat(
    conversation_id: str,
    payload: MessageIn,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.role != "user":
        raise HTTPException(status_code=422, detail="role must be 'user'")
    if getattr(user, "platform_status", "active") != "active":
        raise HTTPException(status_code=403, detail="Account not active")
    if not await _allow_chat_async(user.id):
        agent_name_hint = (
            await db.execute(select(Conversation.agent_id).where(Conversation.id == conversation_id))
        ).scalar_one_or_none()
        if agent_name_hint:
            hint_row = (await db.execute(select(Agent.name).where(Agent.id == agent_name_hint))).scalar_one_or_none()
            if hint_row:
                await dispatch_rate_limit(user, hint_row)
        db.add(EventLog(user_id=user.id, event_type="rate_limit", severity="error", detail="chat rate limit hit"))
        await db.commit()
        raise HTTPException(
            status_code=429,
            detail=(
                f"Chat rate limit exceeded — max {CHAT_RATE_MAX} messages per "
                f"{int(CHAT_RATE_WINDOW_SECONDS // 60)} minutes. Please wait a moment."
            ),
        )

    conv = await _get_owned(db, Conversation, conversation_id, user)
    agent_id = conv.agent_id

    extra_instructions = ""
    if agent_id:
        agent_row = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()
        if agent_row:
            extra_instructions = agent_row.instructions or ""

    user_message = Message(conversation_id=conv.id, role="user", content=payload.text)
    conv.preview = payload.text[:120]
    db.add(user_message)
    await db.commit()
    await db.refresh(user_message)

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id, Message.id != user_message.id)
        .order_by(Message.created_at.desc())
        .limit(6)
    )
    recent = list(reversed(result.scalars().all()))
    history = [{"role": "model" if m.role == "agent" else "user", "content": m.content} for m in recent]

    query_embedding = (await embed_texts([payload.text]))[0]

    search = select(DocumentChunk, Document.name).join(Document, DocumentChunk.document_id == Document.id)
    search = search.where(DocumentChunk.user_id == user.id)
    if agent_id:
        search = search.where((DocumentChunk.agent_id == agent_id) | (DocumentChunk.agent_id.is_(None)))
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
    conversation_id_value = conv.id
    user_id_value = user.id
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
        try:
            async for token in stream_answer(question, contexts, history, extra_instructions):
                answer_parts.append(token)
                yield "data: " + json.dumps({"type": "token", "token": token}) + "\n\n"
        except Exception as exc:
            log.exception("chat stream failed for conversation %s", conversation_id_value)
            try:
                if SessionFactory is not None:
                    async with SessionFactory() as session:
                        session.add(
                            EventLog(
                                user_id=user_id_value,
                                event_type="chat_stream_error",
                                severity="error",
                                detail=str(exc)[:500],
                            )
                        )
                        await session.commit()
            except Exception:
                log.exception("failed persisting chat_stream_error event")
            yield "data: " + json.dumps({"type": "error", "error": str(exc)}) + "\n\n"
            return

        full_answer = "".join(answer_parts)
        sources_json = json.dumps(
            {
                "type": "sources",
                "sources": [{"docId": c["docId"], "source": c["source"]} for c in contexts],
            }
        )
        assistant_id = None
        if full_answer:
            try:
                async with SessionFactory() as session:
                    assistant = Message(
                        conversation_id=conversation_id_value,
                        role="agent",
                        content=full_answer,
                        sources=sources_json,
                    )
                    session.add(assistant)
                    await session.commit()
                    await session.refresh(assistant)
                    assistant_id = assistant.id
            except Exception:
                log.exception("failed persisting assistant message for conversation %s", conversation_id_value)

        await invalidate_user_cache(user_id_value)

        done_line = json.dumps({"type": "done", "messageId": assistant_id})
        yield f"data: {done_line}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
