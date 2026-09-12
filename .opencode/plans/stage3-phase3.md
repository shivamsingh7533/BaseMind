# Stage 3 (Phase 3) — BaseMind Full Implementation Plan

## Context
- Stitch design API key invalidated mid-session; new Stitch screen exports unavailable.
- **Design is NOT a blocker**: full design system already in repo (`stitch/design-system.md` dark, `stitch/design-system-basemind-light.json` light) and applied as Tailwind v4 tokens in the frontend.
- Phase 3 is feature work only. Groundwork already in working tree (uncommitted): `SyncUrlRequest` in `schemas.py`, `page_title()` + `extract_html()` in `ai.py`, `httpx 0.28.1` installed in venv.
- User chose: **Full Phase 3** scope, **existing design**, no Stitch.

## Phase 3 deliverables
1. **URL Sync (crawler ingestion)** — end to end
2. **Deeper analytics** — enrich `/api/dashboard`
3. **Backblaze B2** — optional raw-original storage, graceful fallback when unconfigured
4. **Docs** update (WORKFLOW/TECH_STACK/API)

## Constraints / conventions
- No alembic — DB uses `Base.metadata.create_all`. **Do not add columns.** Reuse `Document.storage_key`:
  - web docs → source URL
  - B2 uploads → B2 object key
- Backend error style: English exact-reason `detail` strings (existing norm).
- Frontend toast style: Hinglish exact-reason (existing norm, e.g. `uploadDocument`).
- Verification ladder: backend `uvicorn` boot + curl; frontend `npm run build` clean.
- Do NOT commit/push unless user asks (repo WORKFLOW says commit-per-unit, but gate on user).

## 1. URL Sync

### Backend — `backend/app/routers.py`
- Imports: `asyncio`, `httpx`, `SyncUrlRequest`, `extract_html`, `page_title`, (reuse `chunk_text`/`embed_texts`).
- Add `MAX_SYNC_BYTES = 2 * 1024 * 1024`.
- Extract shared helper `_persist_document(db, *, user, name, doc_type, text, agent_id=None, source=None)`:
  - `chunk_text` → `embed_texts` → create `Document` (detail `f"{n} chunks indexed"`, status `ready`, `storage_key=source`) + `DocumentChunk` rows → commit/refresh. Raises 422 "No readable text found" if no chunks.
  - Refactor `upload_document` to use it (removes duplicate loop).
- New route `POST /api/documents/sync` (body `SyncUrlRequest`, 201):
  1. Validate `httpx.URL(payload.url)`: scheme in `{http, https}` and host present → else 422 "Invalid URL — must be a full http(s) link".
  2. Ownership check `_get_owned(Agent)` when `agent_id` given.
  3. `httpx.AsyncClient(follow_redirects=True, timeout=15.0)` stream GET; non-200 → 422 `Page returned HTTP {status}`; accumulate bytes up to 2MB → 413 `Page too large (max 2MB)`; empty → 422.
  4. Error mapping: `TimeoutException` → 504 "Timed out reaching {host}"; other `httpx.HTTPError` → 422 "Couldn't reach {host}".
  5. Decode utf-8 (ignore), `title = page_title(html) or host or url`, `text = extract_html(html)`; empty text → 422 "No readable text found at that URL".
  6. `_persist_document(..., doc_type="Web Link", name=title[:220], source=str(url))` → `invalidate_user_cache` → `serialize_document`.

### Frontend — `frontend/src/lib/api.ts` + knowledge page
- `api.ts`: `syncUrl(token, url)` — JSON POST to `/api/documents/sync`, mirrors `uploadDocument` toasts (Hinglish, timeout 60s, AbortController), returns `KnowledgeDoc | null`.
- `frontend/src/app/(app)/knowledge-base/page.tsx`:
  - `syncing` state; Sync button spinner + `disabled` while running.
  - On click: `syncUrl(getToken(), url)` → success `toast.success(`${name} synced`, {description})`, clear input, `fetchDocuments`.
  - Replace "Coming in Phase 3" placeholder caption (`toast.info` + `<p>`) with real fetch; caption: "Fetches the page, extracts text, and indexes it for RAG."
  - `type="Web Link"` already renders Globe icon via `TypeIcon`.

## 2. Analytics — `backend/app/routers.py` `dashboard()`
- Real deltas: `agents_today`, `docs_today`, `convs_today` (created_at >= UTC day start).
- `Active Agents` count (`status='active'`) + total agents.
- Docs-by-type: `SELECT type, count(*) GROUP BY type` → "Knowledge Files" `sub` e.g. `"2 web · 3 files"`.
- Top agent by `queries_24h` → shown in agent card sub.
- Populate `activity` (max 8): recent agents (icon `agent`), recent documents (icon `sync`, `warning` if `status=='failed'`), recent conversations (icon `agent`). Fields `{id, icon, highlight, text, time}` using existing `_fmt_time`.
- Frontend dashboard/page.tsx already renders `stats` (label/value/delta/sub/progress) + `activity` (icon/highlight/text/time) — no frontend change needed.

## 3. Backblaze B2 (optional, graceful)
- `config.py`: add `b2_application_key_id`, `b2_application_key`, `b2_bucket_name` (empty defaults).
- New `backend/app/storage.py`:
  - `get_storage()`: returns `None` if any B2 env missing (feature off); else lazy authorize `b2sdk.v2.B2Api`.
  - `async upload_original(owner_id, filename, raw) -> str | None`: `asyncio.to_thread` sync upload; object key `{owner_id}/{uuid4}-{sanitized_name}`; wraps b2sdk sync call.
- `routers.upload_document`: if storage enabled, upload raw bytes first; **on upload failure log/skip, keep indexing working**; pass key as `source` to `_persist_document`.
- `requirements.txt`: add `b2sdk>=2.0`.
- Untestable without creds → disabled path verified; B2 path documented as best-effort.

## 4. Docs
- `docs/WORKFLOW.md`: Phase 3 → URL sync + analytics done; remaining: B2 (needs keys), production Clerk + custom domain.
- `docs/TECH_STACK.md`: move URL crawler into stack table (httpx + stdlib HTMLParser extractor); note optional b2sdk.
- `docs/API.md`: document `POST /api/documents/sync` + enriched `/api/dashboard` response.

## Verification
1. Backend: `uvicorn app.main:app` boot, `/api/health`; `POST /api/documents/sync` → 401 (no token), 422 (bad URL/bad body).
2. Data-path check (no auth): python snippet — httpx fetch https://example.com → `extract_html` → `chunk_text` → `embed_texts` (uses `.env` GEMINI key) to prove pipeline works.
3. Frontend: `npm run build` clean.
4. `npm run lint` if quick.