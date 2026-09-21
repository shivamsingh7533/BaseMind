import contextlib
import ipaddress
import socket
from datetime import UTC, datetime
from typing import Literal

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..ai import chunk_text, embed_texts, extract_html, extract_text, page_title
from ..auth import get_current_user
from ..cache import cache_get, cache_set, invalidate_user_cache
from ..crawler import crawl_domain
from ..db import get_db
from ..models import Agent, Document, DocumentChunk, EventLog, User
from ..resilience import DEFAULT_TIMEOUT
from ..schemas import DocumentCreate, SyncUrlRequest, serialize_document
from ..storage import delete_original, download_url, is_b2_enabled, upload_original
from .billing import FREE_DOC_LIMIT, get_plan
from .deps import (
    MAX_SYNC_BYTES,
    MAX_UPLOAD_BYTES,
    SYNC_RATE_MAX,
    SYNC_RATE_WINDOW,
    UPLOAD_RATE_MAX,
    UPLOAD_RATE_WINDOW,
    _allow_rate_limited_async,
    _get_owned,
    log,
)

router = APIRouter(prefix="/api")


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


async def _enforce_doc_limit(db: AsyncSession, user: User) -> None:
    if await get_plan(db, user.id) == "free":
        result = await db.execute(select(func.count()).select_from(Document).where(Document.user_id == user.id))
        if result.scalar_one() >= FREE_DOC_LIMIT:
            raise HTTPException(
                status_code=402,
                detail=f"Free plan allows {FREE_DOC_LIMIT} documents. Upgrade to Pro for unlimited knowledge.",
            )


@router.post("/documents", status_code=201)
async def create_document(
    payload: DocumentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _enforce_doc_limit(db, user)
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
    sync_schedule: str = "manual",
    crawl_depth: int = 1,
    last_synced_at: datetime | None = None,
) -> Document:
    try:
        chunks = chunk_text(text)
        if not chunks:
            raise HTTPException(status_code=422, detail="No readable text found")
        embeddings = await embed_texts(chunks)
    except HTTPException:
        raise
    except Exception as exc:
        db.add(
            EventLog(
                user_id=user.id,
                event_type="ingest_error",
                severity="error",
                detail=f"{name[:120]}: {exc}",
            )
        )
        await db.commit()
        raise

    doc = Document(
        user_id=user.id,
        name=name[:220],
        type=doc_type,
        detail=f"{len(chunks)} chunks indexed",
        status="ready",
        agent_id=agent_id,
        storage_key=source,
        sync_schedule=sync_schedule,
        crawl_depth=crawl_depth,
        last_synced_at=last_synced_at,
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


async def _bg_index_document(
    doc_id: str,
    user_id: str,
    agent_id: str | None,
    chunks: list[str],
    source: str | None,
) -> None:
    from ..db import SessionFactory

    if SessionFactory is None:
        return
    try:
        embeddings = await embed_texts(chunks)
        async with SessionFactory() as session:
            for index, (chunk, embedding) in enumerate(zip(chunks, embeddings, strict=False)):
                session.add(
                    DocumentChunk(
                        document_id=doc_id,
                        user_id=user_id,
                        agent_id=agent_id,
                        content=chunk,
                        chunk_index=index,
                        embedding=embedding,
                    )
                )
            result = await session.execute(select(Document).where(Document.id == doc_id))
            doc_row = result.scalar_one_or_none()
            if doc_row:
                doc_row.status = "ready"
                doc_row.detail = f"{len(chunks)} chunks indexed"
            await session.commit()
    except Exception as exc:
        log.exception("Background indexing failed for doc %s", doc_id)
        if source and is_b2_enabled():
            with contextlib.suppress(Exception):
                await delete_original(source)
        async with SessionFactory() as session:
            result = await session.execute(select(Document).where(Document.id == doc_id))
            doc_row = result.scalar_one_or_none()
            if doc_row:
                doc_row.status = "failed"
                doc_row.detail = f"Indexing failed: {str(exc)[:100]}"
            session.add(
                EventLog(
                    user_id=user_id,
                    event_type="ingest_error",
                    severity="error",
                    detail=f"Background indexing failed for doc {doc_id}: {exc}",
                )
            )
            await session.commit()
    finally:
        await invalidate_user_cache(user_id)


def _is_blocked_url(url: httpx.URL) -> bool:
    host = (url.host or "").split("%")[0]
    if host.lower() in {"localhost", "127.0.0.1"} or host == "0.0.0.0":  # noqa: S104
        return True
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        if not ip.is_global:
            return True
    return False


async def _stream_url_safe(payload_url: str) -> bytes:
    current = httpx.URL(payload_url)
    async with httpx.AsyncClient(follow_redirects=False, timeout=DEFAULT_TIMEOUT) as client:
        redirects = 0
        while True:
            if current.scheme not in ("http", "https") or not current.host:
                raise HTTPException(status_code=422, detail="Invalid URL — must be a full http(s) link")
            if _is_blocked_url(current):
                raise HTTPException(
                    status_code=422,
                    detail="URL resolves to a private/internal address — blocked for security",
                )
            async with client.stream("GET", str(current)) as res:
                if res.status_code in (301, 302, 303, 307, 308):
                    redirects += 1
                    if redirects > 5:
                        raise HTTPException(status_code=422, detail="Too many redirects")
                    location = res.headers.get("location")
                    if not location:
                        raise HTTPException(status_code=422, detail="Redirect response missing a Location header")
                    try:
                        current = current.join(location)
                    except Exception:
                        raise HTTPException(status_code=422, detail="Invalid redirect URL") from None
                    continue
                if res.status_code != 200:
                    raise HTTPException(status_code=422, detail=f"Page returned HTTP {res.status_code}")
                raw = b""
                async for block in res.aiter_bytes():
                    raw += block
                    if len(raw) > MAX_SYNC_BYTES:
                        raise HTTPException(status_code=413, detail="Page too large (max 2MB)")
                return raw


@router.post("/documents/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    agent_id: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    if not await _allow_rate_limited_async("upload", user.id, UPLOAD_RATE_MAX, UPLOAD_RATE_WINDOW):
        raise HTTPException(status_code=429, detail="Rate limit: too many uploads, try again shortly")
    await _enforce_doc_limit(db, user)
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    if agent_id:
        await _get_owned(db, Agent, agent_id, user)

    text = extract_text(file.filename or "upload.txt", raw)
    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=422, detail="No readable text found")
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

    # For documents with more than 2 chunks, process embeddings in the background if background_tasks is available
    if background_tasks is not None and len(chunks) > 2:
        doc = Document(
            user_id=user.id,
            name=(file.filename or "upload.txt")[:220],
            type=doc_type,
            detail=f"Processing {len(chunks)} chunks in background...",
            status="processing",
            agent_id=agent_id,
            storage_key=source,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        await invalidate_user_cache(user.id)
        background_tasks.add_task(_bg_index_document, doc.id, user.id, agent_id, chunks, source)
        return serialize_document(doc)

    try:
        doc = await _persist_document(
            db,
            user=user,
            name=file.filename or "upload.txt",
            doc_type=doc_type,
            text=text,
            agent_id=agent_id,
            source=source,
        )
    except Exception:
        if source and is_b2_enabled():
            with contextlib.suppress(Exception):
                await delete_original(source)
        raise
    await invalidate_user_cache(user.id)
    return serialize_document(doc)


@router.post("/documents/sync", status_code=201)
async def sync_url(
    payload: SyncUrlRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    if not await _allow_rate_limited_async("sync", user.id, SYNC_RATE_MAX, SYNC_RATE_WINDOW):
        raise HTTPException(status_code=429, detail="Rate limit: too many syncs, try again shortly")
    await _enforce_doc_limit(db, user)
    parsed = httpx.URL(payload.url)
    if parsed.scheme not in ("http", "https") or not parsed.host:
        raise HTTPException(status_code=422, detail="Invalid URL — must be a full http(s) link")
    if payload.agent_id:
        await _get_owned(db, Agent, payload.agent_id, user)

    raw = b""
    try:
        raw = await _stream_url_safe(str(parsed))
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

    crawl_depth = getattr(payload, "crawl_depth", 1) or 1
    sync_sched = getattr(payload, "sync_schedule", "manual") or "manual"
    now_sync = datetime.now(UTC)

    # If crawler depth > 1, spider same-domain internal links
    if crawl_depth > 1:
        pages = await crawl_domain(str(parsed), max_depth=crawl_depth, max_pages=10)
        if pages:
            full_text = "\n\n".join(f"### Page: {p['title']} ({p['url']})\n{p['text']}" for p in pages)
            title = f"{page_title(html) or parsed.host} ({len(pages)} pages spidered)"
            text = full_text

    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=422, detail="No readable text found at that URL")

    # For web content with more than 2 chunks, process in the background if background_tasks is available
    if background_tasks is not None and len(chunks) > 2:
        doc = Document(
            user_id=user.id,
            name=title[:220],
            type="Web Link",
            detail=f"Processing {len(chunks)} chunks in background...",
            status="processing",
            agent_id=payload.agent_id,
            storage_key=str(parsed),
            sync_schedule=sync_sched,
            crawl_depth=crawl_depth,
            last_synced_at=now_sync,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        await invalidate_user_cache(user.id)
        background_tasks.add_task(_bg_index_document, doc.id, user.id, payload.agent_id, chunks, str(parsed))
        return serialize_document(doc)

    doc = await _persist_document(
        db,
        user=user,
        name=title,
        doc_type="Web Link",
        text=text,
        agent_id=payload.agent_id,
        source=str(parsed),
        sync_schedule=sync_sched,
        crawl_depth=crawl_depth,
        last_synced_at=now_sync,
    )
    await invalidate_user_cache(user.id)
    return serialize_document(doc)


class DocumentScheduleUpdate(BaseModel):
    sync_schedule: Literal["manual", "daily", "weekly"]


@router.post("/documents/{document_id}/resync")
async def resync_document(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_owned(db, Document, document_id, user)
    if not doc.storage_key or not doc.storage_key.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Only web link documents can be re-synced")

    depth = getattr(doc, "crawl_depth", 1) or 1
    pages = await crawl_domain(doc.storage_key, max_depth=depth, max_pages=10)
    if not pages:
        raise HTTPException(status_code=422, detail="Failed to fetch content from URL during resync")

    full_text = "\n\n".join(f"### Page: {p['title']} ({p['url']})\n{p['text']}" for p in pages)
    chunks = chunk_text(full_text)
    if not chunks:
        raise HTTPException(status_code=422, detail="No readable text found during resync")

    embeddings = await embed_texts(chunks)

    # Delete old chunks
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))

    # Insert new chunks
    for idx, (content, emb) in enumerate(zip(chunks, embeddings, strict=True)):
        db.add(
            DocumentChunk(
                document_id=doc.id,
                user_id=user.id,
                agent_id=doc.agent_id,
                content=content,
                chunk_index=idx,
                embedding=emb,
            )
        )

    doc.last_synced_at = datetime.now(UTC)
    doc.detail = f"Synced {len(pages)} page{'s' if len(pages) > 1 else ''}, {len(chunks)} chunks"
    doc.status = "ready"
    await db.commit()
    await db.refresh(doc)
    await invalidate_user_cache(user.id)
    return serialize_document(doc)


@router.patch("/documents/{document_id}/schedule")
async def update_document_schedule(
    document_id: str,
    payload: DocumentScheduleUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_owned(db, Document, document_id, user)
    doc.sync_schedule = payload.sync_schedule
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
