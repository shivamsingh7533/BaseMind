import contextlib
import json
import logging
import time
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .ai import (
    chunk_text,
    embed_texts,
    extract_html,
    extract_text,
    page_title,
    stream_answer,
)
from .auth import get_current_user
from .cache import cache_get, cache_set, invalidate_user_cache
from .db import SessionFactory, get_db
from .email import dispatch_digest, dispatch_rate_limit, dispatch_welcome
from .models import EMBEDDING_DIM, Agent, Conversation, Document, DocumentChunk, Message, User
from .schemas import (
    AgentCreate,
    AgentUpdate,
    ConversationCreate,
    ConversationUpdate,
    DocumentCreate,
    MessageIn,
    SyncUrlRequest,
    _fmt_time,
    serialize_agent,
    serialize_conversation,
    serialize_document,
)
from .storage import delete_original, download_url, is_b2_enabled, upload_original

log = logging.getLogger("basemind.api")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_SYNC_BYTES = 2 * 1024 * 1024

CHAT_RATE_WINDOW_SECONDS = 300.0
CHAT_RATE_MAX = 20
_chat_hits: dict[str, list[float]] = {}


def _allow_chat(user_id: str) -> bool:
    now = time.time()
    hits = [t for t in _chat_hits.get(user_id, []) if now - t < CHAT_RATE_WINDOW_SECONDS]
    if len(hits) >= CHAT_RATE_MAX:
        _chat_hits[user_id] = hits
        return False
    hits.append(now)
    _chat_hits[user_id] = hits
    return True


router = APIRouter(prefix="/api")


async def _get_owned(db: AsyncSession, model, obj_id: str, user: User):
    result = await db.execute(select(model).where(model.id == obj_id, model.user_id == user.id))
    obj = result.scalar_one_or_none()
    if obj is None:
        exists = await db.execute(select(model.id).where(model.id == obj_id))
        if exists.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"{model.__name__} belongs to a different account (you may have signed in with another method)"
                ),
            )
        raise HTTPException(
            status_code=404,
            detail=f"{model.__name__} not found — it may already be deleted",
        )
    return obj


@router.get("/agents")
async def list_agents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cache_key = f"agents:{user.id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc()))
    payload = [serialize_agent(a) for a in result.scalars()]
    await cache_set(cache_key, payload)
    return payload


@router.post("/agents", status_code=201)
async def create_agent(
    payload: AgentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = Agent(
        user_id=user.id,
        name=payload.name,
        url=payload.url,
        instructions=payload.instructions,
        color=payload.color,
        status="active",
        train_progress=100,
    )
    existing = (await db.execute(select(func.count()).select_from(Agent).where(Agent.user_id == user.id))).scalar_one()
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    await invalidate_user_cache(user.id)
    if existing == 0:
        await dispatch_welcome(user)
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
async def list_documents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cache_key = f"docs:{user.id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc()))
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


async def _persist_document(
    db: AsyncSession,
    *,
    user: User,
    name: str,
    doc_type: str,
    text: str,
    agent_id: str | None = None,
    source: str | None = None,
) -> Document:
    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=422, detail="No readable text found")
    embeddings = await embed_texts(chunks)

    doc = Document(
        user_id=user.id,
        name=name[:220],
        type=doc_type,
        detail=f"{len(chunks)} chunks indexed",
        status="ready",
        agent_id=agent_id,
        storage_key=source,
    )
    db.add(doc)
    await db.flush()

    for index, (chunk, embedding) in enumerate(zip(chunks, embeddings, strict=False)):
        db.add(
            DocumentChunk(
                document_id=doc.id,
                user_id=user.id,
                agent_id=agent_id,
                content=chunk,
                chunk_index=index,
                embedding=embedding,
            )
        )

    await db.commit()
    await db.refresh(doc)
    return doc


@router.post("/documents/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    agent_id: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    if agent_id:
        await _get_owned(db, Agent, agent_id, user)

    text = extract_text(file.filename or "upload.txt", raw)
    doc_type = "PDF" if (file.filename or "").lower().endswith(".pdf") else "Text"

    source = None
    try:
        source = await upload_original(user.id, file.filename or "upload.txt", raw)
    except Exception:
        log.warning(
            "B2 upload_original failed for user %s file %r",
            user.id,
            file.filename,
            exc_info=True,
        )

    doc = await _persist_document(
        db,
        user=user,
        name=file.filename or "upload.txt",
        doc_type=doc_type,
        text=text,
        agent_id=agent_id,
        source=source,
    )
    await invalidate_user_cache(user.id)
    return serialize_document(doc)


@router.post("/documents/sync", status_code=201)
async def sync_url(
    payload: SyncUrlRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parsed = httpx.URL(payload.url)
    if parsed.scheme not in ("http", "https") or not parsed.host:
        raise HTTPException(status_code=422, detail="Invalid URL — must be a full http(s) link")
    if payload.agent_id:
        await _get_owned(db, Agent, payload.agent_id, user)

    raw = b""
    try:
        async with (
            httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client,
            client.stream("GET", str(parsed)) as res,
        ):
            if res.status_code != 200:
                raise HTTPException(status_code=422, detail=f"Page returned HTTP {res.status_code}")
            async for block in res.aiter_bytes():
                raw += block
                if len(raw) > MAX_SYNC_BYTES:
                    raise HTTPException(status_code=413, detail="Page too large (max 2MB)")
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"Timed out reaching {parsed.host}") from None
    except httpx.HTTPError:
        raise HTTPException(status_code=422, detail=f"Couldn't reach {parsed.host}") from None
    if not raw:
        raise HTTPException(status_code=422, detail="Empty response from site")

    html = raw.decode("utf-8", errors="ignore")
    title = page_title(html) or parsed.host or payload.url
    text = extract_html(html)
    if not text:
        raise HTTPException(status_code=422, detail="No readable text found at that URL")

    doc = await _persist_document(
        db,
        user=user,
        name=title,
        doc_type="Web Link",
        text=text,
        agent_id=payload.agent_id,
        source=str(parsed),
    )
    await invalidate_user_cache(user.id)
    return serialize_document(doc)


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_owned(db, Document, document_id, user)
    if doc.storage_key and is_b2_enabled():
        with contextlib.suppress(Exception):
            await delete_original(doc.storage_key)
    await db.delete(doc)
    await db.commit()
    await invalidate_user_cache(user.id)


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url = await _resolve_download(db, document_id, user)
    return RedirectResponse(url, 302)


@router.get("/documents/{document_id}/download-url")
async def download_document_url(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url = await _resolve_download(db, document_id, user)
    return {"url": url}


async def _resolve_download(db: AsyncSession, document_id: str, user: User) -> str:
    doc = await _get_owned(db, Document, document_id, user)
    if doc.type == "Web Link":
        if not doc.storage_key:
            raise HTTPException(status_code=404, detail="Original URL not stored")
        return doc.storage_key
    if not doc.storage_key:
        raise HTTPException(
            status_code=404,
            detail="Original file not stored (B2 was off when this was uploaded)",
        )
    if not is_b2_enabled():
        raise HTTPException(status_code=503, detail="Storage not configured")
    try:
        url = await download_url(doc.storage_key)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch file from storage") from None
    if url is None:
        raise HTTPException(status_code=404, detail="File no longer in storage")
    return url


@router.get("/documents/{document_id}/preview")
async def document_preview(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_owned(db, Document, document_id, user)
    result = await db.execute(
        select(DocumentChunk.content).where(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.chunk_index)
    )
    preview = "\n\n".join(r[0] for r in result.all())
    if len(preview) > 2000:
        preview = preview[:2000] + "\n…"
    return {
        "id": doc.id,
        "name": doc.name,
        "type": doc.type,
        "detail": doc.detail,
        "preview": preview,
    }


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


@router.get("/settings/status")
async def settings_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {
        "db_configured": SessionFactory is not None,
        "b2_enabled": is_b2_enabled(),
    }


@router.delete("/me", status_code=204)
async def delete_workspace(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    docs = (await db.execute(select(Document).where(Document.user_id == user.id))).scalars().all()
    for doc in docs:
        if doc.storage_key and is_b2_enabled():
            with contextlib.suppress(Exception):
                await delete_original(doc.storage_key)
    await db.execute(delete(Conversation).where(Conversation.user_id == user.id))
    await db.execute(delete(Document).where(Document.user_id == user.id))
    await db.execute(delete(Agent).where(Agent.user_id == user.id))
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
    await invalidate_user_cache(user.id)


@router.get("/dashboard")
async def dashboard(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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
        await db.execute(select(func.count()).select_from(Conversation).where(Conversation.user_id == user.id))
    ).scalar_one()

    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    convs_today = (
        await db.execute(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.user_id == user.id, Conversation.started_at >= day_start)
        )
    ).scalar_one()
    agents_today = (
        await db.execute(
            select(func.count()).select_from(Agent).where(Agent.user_id == user.id, Agent.created_at >= day_start)
        )
    ).scalar_one()
    docs_today = (
        await db.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.user_id == user.id, Document.created_at >= day_start)
        )
    ).scalar_one()
    active_agents = (
        await db.execute(
            select(func.count()).select_from(Agent).where(Agent.user_id == user.id, Agent.status == "active")
        )
    ).scalar_one()

    top_agent = (
        await db.execute(select(Agent).where(Agent.user_id == user.id).order_by(Agent.queries_24h.desc()).limit(1))
    ).scalar_one_or_none()

    failed_docs = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.user_id == user.id, Document.status == "failed")
        )
    ).scalar_one()

    embeddings_count = (
        await db.execute(select(func.count()).select_from(DocumentChunk).where(DocumentChunk.user_id == user.id))
    ).scalar_one()
    ready_docs = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.user_id == user.id, Document.status == "ready")
        )
    ).scalar_one()
    pending_docs = (
        await db.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.user_id == user.id, Document.status == "processing")
        )
    ).scalar_one()
    if embeddings_count == 0 and pending_docs == 0:
        vector_status = "empty"
    elif pending_docs > 0:
        vector_status = "syncing"
    elif failed_docs > 0:
        vector_status = "attention"
    else:
        vector_status = "synced"
    vector = {
        "embeddings": embeddings_count,
        "indexedDocs": ready_docs,
        "pendingDocs": pending_docs,
        "failedDocs": failed_docs,
        "dim": EMBEDDING_DIM,
        "status": vector_status,
    }

    doc_types = (
        await db.execute(select(Document.type, func.count()).where(Document.user_id == user.id).group_by(Document.type))
    ).all()
    web_count = sum(n for t, n in doc_types if t and str(t).lower().startswith("web"))
    file_count = sum(n for t, n in doc_types) - web_count

    recent_docs = (
        (
            await db.execute(
                select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc()).limit(3)
            )
        )
        .scalars()
        .all()
    )
    recent_agents = (
        (await db.execute(select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc()).limit(2)))
        .scalars()
        .all()
    )
    recent_convs = (
        (
            await db.execute(
                select(Conversation)
                .where(Conversation.user_id == user.id)
                .order_by(Conversation.started_at.desc())
                .limit(3)
            )
        )
        .scalars()
        .all()
    )

    activity: list[dict] = []
    for a in recent_docs:
        failed = a.status == "failed"
        activity.append(
            {
                "id": f"doc-{a.id}",
                "icon": "warning" if failed else "sync",
                "highlight": a.name,
                "text": "failed to index" if failed else "indexed as a knowledge source",
                "time": _fmt_time(a.created_at),
            }
        )
    for ag in recent_agents:
        activity.append(
            {
                "id": f"agent-{ag.id}",
                "icon": "agent",
                "highlight": ag.name,
                "text": "agent created",
                "time": _fmt_time(ag.created_at),
            }
        )
    for c in recent_convs:
        label = (c.preview or "").strip()[:48]
        activity.append(
            {
                "id": f"conv-{c.id}",
                "icon": "agent",
                "highlight": label or "New conversation",
                "text": "conversation started",
                "time": _fmt_time(c.started_at),
            }
        )

    resolution_value = "0%"
    resolution_sub = "needs live traffic"
    if convs_count:
        answered = (
            await db.execute(
                select(func.count())
                .select_from(Message)
                .where(
                    Message.conversation_id.in_(select(Conversation.id).where(Conversation.user_id == user.id)),
                    Message.role == "agent",
                )
            )
        ).scalar_one()
        resolution_value = f"{min(round(answered / convs_count * 100), 100)}%"
        resolution_sub = f"{answered} answered of {convs_count} conversations"

    agents = (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalars().all()
    conv_by_agent = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(Conversation.user_id == user.id)
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    msgs_by_agent = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .select_from(Message)
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.user_id == user.id,
                    Message.role == "agent",
                    Conversation.agent_id.isnot(None),
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    resolved_by_agent = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.status == "resolved",
                    Conversation.agent_id.isnot(None),
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    per_agent = [
        {
            "id": ag.id,
            "name": ag.name,
            "color": ag.color,
            "queries24h": ag.queries_24h,
            "conversations": conv_by_agent.get(ag.id, 0),
            "agentMsgs": msgs_by_agent.get(ag.id, 0),
            "resolved": resolved_by_agent.get(ag.id, 0),
            "avgLatencyMs": ag.avg_latency_ms,
        }
        for ag in agents
    ]
    per_agent.sort(key=lambda a: (-a["agentMsgs"], -a["queries24h"]))

    week_start = day_start - timedelta(days=6)
    conv_day = func.date_trunc(text("'day'"), Conversation.started_at)
    conv_by_day = dict(
        (
            await db.execute(
                select(conv_day, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.started_at >= week_start,
                )
                .group_by(conv_day)
            )
        ).all()
    )
    msg_day = func.date_trunc(text("'day'"), Message.created_at)
    msgs_by_day = dict(
        (
            await db.execute(
                select(msg_day, func.count())
                .select_from(Message)
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.user_id == user.id,
                    Message.role == "agent",
                    Message.created_at >= week_start,
                )
                .group_by(msg_day)
            )
        ).all()
    )
    trend7d = [
        {
            "date": day.strftime("%Y-%m-%d"),
            "conversations": conv_by_day.get(day, 0),
            "agentMsgs": msgs_by_day.get(day, 0),
        }
        for i in range(6, -1, -1)
        for day in (day_start - timedelta(days=i),)
    ]

    stats = [
        {
            "id": "agents",
            "label": "Total Agents",
            "value": str(agents_count),
            "delta": f"+{agents_today}" if agents_today else None,
            "sub": (f"{active_agents} active · best: {top_agent.name}" if top_agent else f"{active_agents} active"),
            "progress": min(agents_count * 10, 100),
        },
        {
            "id": "documents",
            "label": "Knowledge Files",
            "value": str(docs_count),
            "delta": f"+{docs_today}" if docs_today else None,
            "sub": f"{web_count} web · {file_count} files",
            "progress": min(docs_count * 5, 100),
        },
        {
            "id": "conversations",
            "label": "Conversations",
            "value": str(convs_count),
            "delta": f"+{convs_today}" if convs_today else None,
            "sub": f"{convs_today} today",
            "progress": min(convs_count * 2, 100),
        },
        {
            "id": "resolution",
            "label": "Auto-resolution",
            "value": resolution_value,
            "delta": "—",
            "sub": resolution_sub,
            "progress": int(resolution_value[:-1]) if resolution_value != "0%" else 0,
        },
    ]
    payload = {
        "stats": stats,
        "activity": activity[:8],
        "perAgent": per_agent,
        "trend7d": trend7d,
        "vector": vector,
    }
    since_24h = datetime.now(UTC) - timedelta(days=1)
    q24 = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.agent_id.isnot(None),
                    Conversation.started_at >= since_24h,
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    r24 = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.agent_id.isnot(None),
                    Conversation.status == "resolved",
                    Conversation.started_at >= since_24h,
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    h24 = dict(
        (
            await db.execute(
                select(Conversation.agent_id, func.count())
                .where(
                    Conversation.user_id == user.id,
                    Conversation.agent_id.isnot(None),
                    Conversation.status == "halted",
                    Conversation.started_at >= since_24h,
                )
                .group_by(Conversation.agent_id)
            )
        ).all()
    )
    await dispatch_digest(
        user,
        {
            "agents": [
                {
                    "name": ag.name,
                    "queries": q24.get(ag.id, 0),
                    "resolved": r24.get(ag.id, 0),
                    "halted": h24.get(ag.id, 0),
                }
                for ag in agents
            ]
        },
    )
    await cache_set(cache_key, payload)
    return payload


@router.post("/conversations/{conversation_id}/chat")
async def chat(
    conversation_id: str,
    payload: MessageIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.role != "user":
        raise HTTPException(status_code=422, detail="role must be 'user'")
    if not _allow_chat(user.id):
        agent_name_hint = (
            await db.execute(select(Conversation.agent_id).where(Conversation.id == conversation_id))
        ).scalar_one_or_none()
        if agent_name_hint:
            hint_row = (await db.execute(select(Agent.name).where(Agent.id == agent_name_hint))).scalar_one_or_none()
            if hint_row:
                await dispatch_rate_limit(user, hint_row)
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
            yield "data: " + json.dumps({"type": "error", "error": str(exc)}) + "\n\n"
            return

        full_answer = "".join(answer_parts)
        assistant_id = None
        try:
            async with SessionFactory() as session:
                assistant = Message(
                    conversation_id=conversation_id_value,
                    role="agent",
                    content=full_answer,
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
