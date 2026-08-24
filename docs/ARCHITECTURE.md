# Architecture

```
Browser (Next.js on Vercel)
  │  Clerk JS session (JWT)
  │
  ├──► FastAPI on Render
  │      ├── auth.py    : verify Clerk JWT against CLERK_JWKS_URL, upsert user row
  │      ├── routers.py : agents / documents / conversations / dashboard
  │      ├── ai.py      : embeddings, chunking, streaming answers (Gemini)
  │      └── db.py      : async engine/session factory
  │            │
  │            ▼
  │      Neon Postgres (pgvector)
  │
  └──► Clerk FAPI (secure-griffon-2008.clerk.accounts.dev) for session tokens
```

## Request lifecycle: document upload
1. Browser picks file → `uploadDocument()` posts multipart to `/api/documents/upload` with bearer token.
2. Backend verifies JWT, resolves user, enforces 10 MB limit and extension allowlist.
3. Text extracted (pypdf for PDFs, utf-8 read otherwise).
4. `chunk_text()` splits into 1200-char chunks with 150-char overlap.
5. `embed_texts()` batches chunks through Gemini embeddings (768 dims).
6. Rows inserted into `document_chunks` with `Vector(768)` column.
7. Response returns doc metadata incl. `"indexed, N chunks"`.

## Request lifecycle: chat (RAG)
1. Client opens SSE fetch to `/api/conversations/{id}/chat`.
2. Question embedded → cosine similarity search over the user's chunks.
3. System prompt = base persona + agent's custom `instructions`.
4. `stream_answer()` streams from `gemini-3.6-flash`; first frame carries retrieved sources, then token frames.
5. User + assistant messages persisted after the stream finishes.

## Frontend data flow
- `src/lib/api.ts`: thin typed fetchers; every failure surfaces an exact-reason toast.
- `src/lib/store.ts`: Zustand store with TTL cache; protected pages call `fetch*(getToken())` on mount.
- `src/middleware.ts`: clerkMiddleware guards `/dashboard|/agents|/knowledge-base|/logs|/settings`, redirects to `/login?redirect_url=…`.

## Identity model
One Postgres `users` row per Clerk `sub`. Agents/documents/conversations reference it; all queries are ownership-scoped (`_get_owned`).
