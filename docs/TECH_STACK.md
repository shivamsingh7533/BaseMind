# Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 16.3.2 (App Router, Turbopack) | TypeScript, Tailwind CSS, shadcn-style UI kit |
| State | Zustand + TTL cache | `src/lib/store.ts` |
| Auth | Clerk (`@clerk/nextjs` 7.8.0) | Dev instance `secure-griffon-2008`; catch-all `/login`, `/signup` routes; middleware guard |
| Backend | FastAPI (Python 3.14 venv) | SQLAlchemy 2 async, PyJWT `PyJWKClient` for Clerk JWKS |
| Database | Neon Postgres + pgvector | Shared by local dev and Render |
| Embeddings | Gemini `gemini-embedding-001` | 768 dims via `output_dimensionality` (text-embedding-004 is dead for new keys) |
| Chat model | Gemini `gemini-3.6-flash` | streaming via `google-genai` SDK (`await client.aio.models.generate_content_stream`) |
| File parsing | pypdf + plain-text readers | PDF/TXT/CSV/MD up to 10 MB |
| Web hosting | Vercel | `base-mind.vercel.app`, Analytics enabled |
| API hosting | Render free tier | `basemind-api.onrender.com`; sleeps after ~15 min idle |
| Toasts/UX | sonner | exact-reason error messages everywhere |

## Planned
- **Backblaze B2** object storage for large files (raw originals, media) — Postgres stores only extracted text today.
- URL crawler ingestion ("Sync URL") — Phase 3.
