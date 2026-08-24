# Deployment

## Topology
- **Frontend** → Vercel, auto-deploys `main` from GitHub (`base-mind.vercel.app`).
- **Backend** → Render free tier (`basemind-api.onrender.com`), auto-deploys on push.
- **Database** → Neon Postgres, same instance shared by local `.env` and Render.

## Frontend env vars (Vercel + local `.env.local`)
| var | value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` (decodes to your Clerk instance) |
| `NEXT_PUBLIC_API_URL` | `https://basemind-api.onrender.com` (prod) / `http://localhost:8000` (local) |

`next.config.ts` pins `CLERK_SIGN_IN_URL=/login`, `CLERK_SIGN_UP_URL=/signup`.

## Backend env vars (Render)
| var | value |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://…neon.tech/neondb?ssl=require` |
| `CLERK_JWKS_URL` | `https://<instance>.clerk.accounts.dev/.well-known/jwks.json` |
| `CLERK_ISSUER` | `https://<instance>.clerk.accounts.dev` |
| `ALLOWED_ORIGINS` | `https://base-mind.vercel.app` |
| `GEMINI_API_KEY` | AI Studio API key |

CORS also allows any `https://*.vercel.app` via regex (preview deploys).

## Deploy checklist
1. Push to `main` → both platforms rebuild.
2. Wake the API: first request after idle may take ~30–60 s (free tier sleep).
3. Verify `GET /api/health` returns ok.
4. Login and confirm `/api/dashboard` returns 200.

## Swapping the Clerk dev instance
1. Create new application at dashboard.clerk.com.
2. Update publishable key in Vercel (+ local) → redeploy frontend.
3. Update `CLERK_JWKS_URL` + `CLERK_ISSUER` in Render to the NEW instance domain → redeploy backend.
4. Old tokens/cookies are invalid; users just log in again.

## Planned
- Backblaze B2 bucket for large-file storage: add `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET` env vars; upload raw originals there, keep extracted text in Postgres.
