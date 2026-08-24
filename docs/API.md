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
Response includes `detail` like `"indexed, N chunks"`.

## Conversations
### `GET /api/conversations`
List conversations for the user.

### `POST /api/conversations` → 201
```json
{ "visitor": "Studio Test", "agent_id": "optional-uuid" }
```

### `GET /api/conversations/{id}`
Full conversation with messages.

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

## Dashboard
### `GET /api/dashboard`
Aggregated stats + recent activity for the dashboard page.
