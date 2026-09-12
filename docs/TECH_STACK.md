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
| URL crawling | httpx (stdlib HTMLParser extractor) | `POST /api/documents/sync`, 2 MB cap, 15 s timeout |
| Hot/cold blob storage | Backblaze B2 via `b2sdk` (lazy, optional) | Enabled for private bucket `BaseMind`; stores raw originals, key `{owner_id}/{uuid}-{file}`; off when `B2_*` env vars unset |
| Web hosting | Vercel | `base-mind.vercel.app`, Analytics enabled |
| API hosting | Render free tier | `basemind-api.onrender.com`; sleeps after ~15 min idle |
| Toasts/UX | sonner | exact-reason error messages everywhere |

## Planned
- **Production Clerk instance** with custom domain — needs paid plan + domain (dev instance `secure-griffon-2008` still in use).
- Large binary/media storage on Backblaze B2 (gateway for raw originals exists today; broaden to arbitrary media files).
