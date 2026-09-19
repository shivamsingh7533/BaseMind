import fnmatch
import json
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..ai import embed_texts, stream_answer
from ..db import SessionFactory, get_db
from ..models import Agent, Conversation, Document, DocumentChunk, Message, User
from ..schemas import MessageIn, serialize_conversation
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
async def get_public_agent(agent_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None or agent.status != "active":
        raise HTTPException(status_code=404, detail="Agent not found or currently inactive")

    owner = (await db.execute(select(User).where(User.id == agent.user_id))).scalar_one_or_none()
    if owner is None or getattr(owner, "platform_status", "active") != "active":
        raise HTTPException(status_code=403, detail="Agent is temporarily unavailable")

    if agent.allowed_domains:
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
        "status": agent.status,
    }


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
    if conv is None or conv.status != "active":
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
        try:
            async for token in stream_answer(
                question,
                contexts,
                history=history,
                extra_instructions=agent_instructions,
            ):
                answer_parts.append(token)
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
            yield "data: {\"type\": \"done\"}\n\n"
        except Exception as e:
            log.exception("public_chat_stream_failed", error=str(e), conversation_id=conversation_id_value)
            yield f"data: {json.dumps({'type': 'error', 'error': 'Failed to complete response'})}\n\n"
        finally:
            full_answer = "".join(answer_parts).strip()
            if full_answer and SessionFactory:
                try:
                    async with SessionFactory() as final_session:
                        final_session.add(
                            Message(
                                conversation_id=conversation_id_value,
                                role="agent",
                                content=full_answer,
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
                    log.exception("public_chat_persist_failed", conversation_id=conversation_id_value)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
