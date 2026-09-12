# API Reference

Base URL: `https://basemind-api.onrender.com`
Auth: all routes except `/api/health` require `Authorization: Bearer <Clerk session JWT>`.
Errors return `{"detail": "<specific reason>"}` — 401 details state exactly why (missing token, issuer mismatch, expired, signature invalid, JWKS unreachable).

## Health
### `GET /api/health`
Returns `{"status": "ok", "service": "basemind-api"}`.

## Agents
### `GET /api/agents`
List agents owned by the authenticated user.

### `POST /api/agents` → 201
```json
{ "name": "Support Bot", "url": "", "instructions": "Be concise.", "color": "#0d9488" }
```

### `PATCH /api/agents/{id}`
Partial update: `{ "status": "paused" }` or any writable field. Used by Pause/Activate buttons.

### `DELETE /api/agents/{id}` → 204
Deletes the agent. Ownership enforced; deleted IDs return detailed 404.

## Documents / Knowledge Base
### `GET /api/documents`
List documents for the current user.

### `POST /api/documents` → 201
JSON metadata-only document (used by tests/tools).

### `POST /api/documents/upload` → 201
`multipart/form-data`, field `file`. Max 10 MB. Formats: PDF, TXT, CSV, MD.
Pipeline: extract text (pypdf/plain) → chunk (1200 chars, 150 overlap) → embed via Gemini (`gemini-embedding-001`, 768-dim) → store rows in `document_chunks`.
When Backblaze B2 is configured, the raw file is also uploaded (object key stored in `Document.storage_key`); upload failures are skipped, indexing still succeeds.
Response includes `detail` like `"indexed, N chunks"` and `storageKey` (B2 object key, or source URL for web links).

### `POST /api/documents/sync` → 201
URL crawler ingestion. Body: `{ "url": "https://docs.example.com", "agent_id": "optional-uuid" }`.
Fetches the page with redirects (15 s timeout, 2 MB cap), extracts the title + readable text via stdlib HTMLParser, then runs the same chunk → embed → pgvector pipeline as upload.
Document `type` is `"Web Link"` (renders with a globe icon in the UI); `storage_key` keeps the source URL.
Exact-reason errors: `422 "Invalid URL — must be a full http(s) link"`, `422 "Page returned HTTP {status}"`, `413 "Page too large (max 2MB)"`, `504 "Timed out reaching {host}"`, `422 "Couldn't reach {host}"`, `422 "No readable text found at that URL"`.

### `GET /api/documents/{id}/download`
Download or open the original source. Auth required.
- **Web Link** documents → `302` to the original source URL.
- **File** documents → `302` to a short-lived **Backblaze signed URL** (not proxied through the API), keyed on the uploaded `storageKey`; the private bucket's auth token guards it.
- Errors: `404` not owned / not found / no `storageKey` ("Original file not stored (B2 was off when this was uploaded)") / B2 object gone ("File no longer in storage"), `503 "Storage not configured"` (B2 env vars missing), `502 "Failed to fetch file from storage"`.
- `DELETE /api/documents/{id}` now also best-effort deletes the matching B2 object.

### `GET /api/documents/{id}/download-url`
Same lookup as `/download` but returns the target as JSON instead of a redirect, for browser JS that must open a signed URL in a new tab (a 302 can't be followed with an auth header): `{ "url": "https://f002.backblazeb2.com/..." }`. Same `404`/`503`/`502` errors.

### `GET /api/documents/{id}/preview`
Auth required. Returns the first ~2 KB of readable text from the document's chunks:
`{ "id", "name", "type", "detail", "preview" }` (`preview` is `""` if the doc has no chunks, e.g. a metadata-only row). Cross-account → `404`.

## Conversations
### `GET /api/conversations`
List conversations for the user.

### `POST /api/conversations` → 201
```json
{ "visitor": "Studio Test", "agent_id": "optional-uuid" }
```

### `GET /api/conversations/{id}`
Full conversation with messages.

### `PATCH /api/conversations/{id}`
Update a conversation. Body: `{ "status": "active" | "resolved" | "halted" }` (and/or `duration_seconds`). Used by the Chat page resolve/halt/reopen controls.

### `POST /api/conversations/{id}/messages` → 201
Append a raw message: `{ "text": "...", "role": "user" }`.

### `POST /api/conversations/{id}/chat`
RAG chat endpoint. Body: `{ "text": "...", "role": "user" }`.
Response: **server-sent events** stream:
```
data: {"type": "sources", "sources": [{"source": "handbook.pdf"}]}
data: {"type": "token", "token": "Ref"}
data: {"type": "token", "token": "unds..."}
data: {"type": "done", "messageId": "uuid-or-null"}
data: {"type": "error", "error": "..."}
```
Flow: embed question → top-k semantic search over `document_chunks` → system prompt (base + agent instructions) → `gemini-3.6-flash` streaming → persist both messages after stream completes.
`sources` entries carry `docId` (the source `Document.id`) so the client can link to view/download the exact source.

## Dashboard
### `GET /api/dashboard`
Aggregated stats + recent activity for the dashboard page.
`stats` (4 cards): Total Agents (delta today, `sub` "`{active} active · best: {name}`"), Knowledge Files (delta today, `sub` "`{n} web · {n} files`"), Conversations (delta today), Auto-resolution (`%` = agent messages / conversations, capped at 100).
`activity` (max 8, newest first): `doc-*` (`sync` icon, `warning` if failed), `agent-*` (`agent`), `conv-*` (`agent`, preview text); each `{id, icon, highlight, text, time}`.
`perAgent`: one object per agent `{id, name, color, queries24h, conversations, agentMsgs, resolved, avgLatencyMs}`, sorted by agent messages (desc).
`trend7d`: exactly 7 day buckets `{date: "YYYY-MM-DD", conversations, agentMsgs}` (oldest → today), 0-filled for empty days.

### `PATCH /api/conversations/{id}`
Payload `{status: "active"|"resolved"|"halted"}`. Returns the serialized conversation.

### `DELETE /api/conversations/{id}`
Auth: bearer token. 204. Deletes the conversation + all its messages (FK `ondelete=CASCADE`), owner-scoped via `_get_owned`.

### `POST /api/conversations/{id}/chat`
SSE chat. **Rate limited** per user: max 20 chat calls per 5 minutes (sliding in-memory window) → `429` with an exact-reason message.

## Workspace
### `GET /api/settings/status`
Auth: bearer token. Returns `{db_configured, b2_enabled}` booleans for the Settings page service-status card.

### `DELETE /api/me`
Auth: bearer token. 204. **Delete workspace**: purges every agent, document (+ its Backblaze B2 original best-effort), conversation, and the `users` row for the caller. Idempotent: a fresh `users` row is upserted on the next login (Clerk account itself is untouched). Messages/document_chunks cascade via FK (`ondelete=CASCADE`).
