# Phase 4 — Chat UX + B2 serving + CI/CD + Analytics

Scope (user-selected, all four): Chat UX & history, B2 document serving, CI/CD + deploy polish, analytics deepening.
Ground rules from this repo: exact-reason errors, `npm run build` gate, commit per logical unit,
zero new frontend dependencies (CSS bars, no chart lib), B2 accessed through `app/storage.py`.

## Suggested order
1. **4A Backend foundations** (small, unblocks 4B/4C): chat sources carry `doc_id`; `GET /api/documents/{id}/download`; per-agent stats in `/api/dashboard`.
2. **4B Chat UI** (biggest build): dedicated chat page with history + conversation switcher.
3. **4C KB + dashboard polish**: Download/View per document; dashboard per-agent + 7-day trend.
4. **4D CI/CD**: GitHub Actions gate (backend compile+boot, frontend build+lint); render.yaml env fix.

---

## 4A — Backend foundations
### 4A1. Chat sources include `doc_id`
- `routers.py` `chat()` search step: after pgvector hit, map each chunk → its `Document` → emit
  `{"type":"sources","sources":[{"docId": <uuid or null>, "source": <doc name>}, ...]}`.
- Old clients ignore unknown field → backward compatible.

### 4A2. `GET /api/documents/{id}/download`
- Auth via `get_current_user`; `_get_owned` → 404 for cross-account.
- Resolve target from `doc.storage_key`:
  - B2 key (`type != "Web Link"`): if B2 disabled → 503 "Storage not configured".
  - Web Link: 302 to the original URL (already public page).
- No B2 key → 404 "Original file not stored" (B2 was disabled at upload time).
- Delivery decision: **proxy stream** B2 → client (`download_bytes` + `StreamingResponse`), 15 s B2 timeout,
  `Content-Disposition: attachment; filename="..."`. No signed-URL leak, private bucket stays private, auth enforced.
  (Signed URL = follow-up.)
- Exact errors: 404 not-owned/missing/storage-key, 503 B2 disabled, 504 B2 timeout, 404 B2 object gone.

## 4B — Chat UI (new `(app)/chat/page.tsx`)
- Sidebar: conversation list (`getConversations` via store) + "New chat" (reuses `createConversation`).
- Main pane: select conversation → `GET /api/conversations/{id}` loads full history (messages render on reload);
  streamed replies appear live via existing `chatStream`.
- Sources bubble → clicking opens a small dialog: "View" (preview via backend `GET /api/documents/{id}/preview`,
  first ~2 KB from `document_chunks`) or "Download" (4A2).
- Turn controls: Retry last message (re-send, drop its placeholder assistant msg), 2-3 follow-up suggestion chips from last answer.
- Keep no-op for `logs`/`agents` Test flows (they already store conversations; new page just reads them).
- Status controls (resolve/halt) via existing `PATCH /api/conversations/{id}`.

## 4C — KB + dashboard polish
- Knowledge-base rows: "Download" button (4A2 link) for file docs; "Open" for web links; delete stays.
- Dashboard additions (backend + frontend, no chart lib):
  - `perAgent` array in `/api/dashboard`: agent name, color, queries_24h, conversations, msgs, avg_latency_ms, conv_resolved.
  - `trend7d`: `[{date, conversations, agentMsgs}]` (last 7 days aggregate) for a CSS bar strip.
- Frontend dashboard renders agent table + 7-day bars; existing cards unchanged.

## 4D — CI/CD + deploy polish
- `.github/workflows/ci.yml`, trigger `push` + `pull_request` on `main`:
  - `backend`: setup-python 3.12, `pip install -r requirements.txt`, `python -m compileall app`, boot smoke
    (`uvicorn app.main:app` no-reload, `/api/health` — but DB ping requires creds → use `DB_SKIP` guard? see note).
  - `frontend`: `npm ci`, `npm run build`, `npm run lint`.
  - Note: backend health hits Neon → CI has no creds. Decision: CI only runs `compileall` + import boot
    (`python -c "import app.main"`), skips DB-dependent health. Prevents secret exposure in CI.
- `render.yaml`: add `B2_APPLICATION_KEY_ID / B2_APPLICATION_KEY / B2_BUCKET_NAME` (`sync: false`) so config is visible;
  actual values stay in Render dashboard. Add `RESTART_POLICY: web`.
- Verify Vercel auto-deploy still green after Phase 4 pushes.

## Docs
- Update after each milestone: `docs/API.md` (download/preview/perAgent/trend7d), `docs/WORKFLOW.md` (Phase 4 status),
  `docs/TECH_STACK.md` (CI), `docs/DEPLOYMENT.md` (B2 env on Render).
- Save gotchas to memory as they surface.

## Verification ladder
| change | check |
|---|---|
| 4A download | curl with token → 200 file bytes (file doc), 302 (web link), 404 cross-account |
| 4A sources | chat SSE includes `docId` |
| 4B chat | reload keeps history; switch conversation; sources dialog opens view/download |
| 4C | dashboard shows per-agent + 7d bars; KB download works |
| 4D | CI run passes on GitHub; render.yaml renders |

## Explicit non-goals
- Signed-URL B2 download (proxy chosen), chat read-receipts/typing indicators, realtime push, chart library, prod Clerk (dev instance stays).