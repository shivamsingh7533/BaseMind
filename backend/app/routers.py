from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .auth import get_current_user
from .cache import cache_get, cache_set, invalidate_user_cache
from .db import get_db
from .models import Agent, Conversation, Document, Message, User
from .schemas import (
    AgentCreate,
    AgentUpdate,
    ConversationCreate,
    ConversationUpdate,
    DocumentCreate,
    MessageIn,
    serialize_agent,
    serialize_conversation,
    serialize_document,
)

router = APIRouter(prefix="/api")


async def _get_owned(db: AsyncSession, model, obj_id: str, user: User):
    result = await db.execute(
        select(model).where(model.id == obj_id, model.user_id == user.id)
    )
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found")
    return obj


@router.get("/agents")
async def list_agents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cache_key = f"agents:{user.id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(
        select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc())
    )
    payload = [serialize_agent(a) for a in result.scalars()]
    await cache_set(cache_key, payload)
    return payload


@router.post("/agents", status_code=201)
async def create_agent(
    payload: AgentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = Agent(user_id=user.id, name=payload.name, url=payload.url, status="paused")
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    await invalidate_user_cache(user.id)
    return serialize_agent(agent)


@router.patch("/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await _get_owned(db, Agent, agent_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    await db.commit()
    await db.refresh(agent)
    await invalidate_user_cache(user.id)
    return serialize_agent(agent)


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = await _get_owned(db, Agent, agent_id, user)
    await db.delete(agent)
    await db.commit()
    await invalidate_user_cache(user.id)


@router.get("/documents")
async def list_documents(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    cache_key = f"docs:{user.id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(
        select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
    )
    payload = [serialize_document(d) for d in result.scalars()]
    await cache_set(cache_key, payload)
    return payload


@router.post("/documents", status_code=201)
async def create_document(
    payload: DocumentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.agent_id:
        await _get_owned(db, Agent, payload.agent_id, user)
    doc = Document(
        user_id=user.id,
        name=payload.name,
        type=payload.type,
        detail=payload.detail,
        agent_id=payload.agent_id,
        status="ready",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    await invalidate_user_cache(user.id)
    return serialize_document(doc)


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_owned(db, Document, document_id, user)
    await db.delete(doc)
    await db.commit()
    await invalidate_user_cache(user.id)


@router.get("/conversations")
async def list_conversations(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
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
    await db.refresh(conv)
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
    message = Message(conversation_id=conv.id, role=payload.role, content=payload.text)
    conv.preview = payload.text[:120]
    db.add(message)
    await db.commit()
    await db.refresh(message)
    await invalidate_user_cache(user.id)
    return {
        "id": message.id,
        "role": message.role,
        "text": message.content,
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
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(conv, field, value)
    await db.commit()
    await db.refresh(conv)
    await invalidate_user_cache(user.id)
    return serialize_conversation(conv)


@router.get("/dashboard")
async def dashboard(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    cache_key = f"dash:{user.id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    agents_count = (
        await db.execute(select(func.count()).select_from(Agent).where(Agent.user_id == user.id))
    ).scalar_one()
    docs_count = (
        await db.execute(select(func.count()).select_from(Document).where(Document.user_id == user.id))
    ).scalar_one()
    convs_count = (
        await db.execute(
            select(func.count()).select_from(Conversation).where(Conversation.user_id == user.id)
        )
    ).scalar_one()

    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    convs_today = (
        await db.execute(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.user_id == user.id, Conversation.started_at >= day_start)
        )
    ).scalar_one()

    stats = [
        {
            "id": "agents",
            "label": "Total Agents",
            "value": str(agents_count),
            "delta": "+0",
            "sub": f"{docs_count} knowledge sources",
            "progress": min(agents_count * 10, 100),
        },
        {
            "id": "documents",
            "label": "Knowledge Files",
            "value": str(docs_count),
            "delta": "+0",
            "sub": "indexed & searchable",
            "progress": min(docs_count * 5, 100),
        },
        {
            "id": "conversations",
            "label": "Conversations",
            "value": str(convs_count),
            "delta": f"+{convs_today}",
            "sub": f"{convs_today} today",
            "progress": min(convs_count * 2, 100),
        },
        {
            "id": "resolution",
            "label": "Auto-resolution",
            "value": "0%",
            "delta": "—",
            "sub": "needs live traffic",
            "progress": 0,
        },
    ]
    payload = {"stats": stats, "activity": []}
    await cache_set(cache_key, payload)
    return payload
