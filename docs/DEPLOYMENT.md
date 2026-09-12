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
| `B2_APPLICATION_KEY_ID` | Backblaze B2 app key ID (scoped, bucket `BaseMind`) |
| `B2_APPLICATION_KEY` | Backblaze B2 application key |
| `B2_BUCKET_NAME` | `BaseMind` |

CORS also allows any `https://*.vercel.app` via regex (preview deploys).

## CI
`main` push / PR runs `.github/workflows/ci.yml`: backend `compileall` + `import app.main` boot (never touches the DB — keys stay out of CI), frontend `npm ci` + `npm run lint` + `npm run build`. Green CI required before deploy reviews.

`render.yaml` declares the B2 service env (`B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, all `sync: false`) plus `restartPolicy: web`; the actual secret values stay in the Render dashboard.

## Deploy checklist
1. Push to `main` → both platforms rebuild.
2. Wake the API: first request after idle may take ~30–60 s (free tier sleep).
3. Verify `GET /api/health` returns ok.
4. Login and confirm `/api/dashboard` returns 200.

## Soft-launch checklist (final regression)
1. CI green on the pushed commit (both jobs).
2. Full functional suite passes locally (temp `test_all.py`, **50/50**).
3. Landing: `/` renders, both CTAs route to `/signup`, footer has Privacy/Terms links.
4. Authenticated smoke on prod URLs:
   - Dashboard loads 4 stats + onboarding checklist (fresh account).
   - Agent Studio: create an agent.
   - Knowledge Base: upload a file → row shows chunks; Actions (Open/Download/Delete) work.
   - Chat: new conversation streams with sources; status Resolve/Halt; conversation delete removes the thread.
   - Settings: Service Status shows DB + B2 Connected; "Delete workspace" typed-confirm wipes data.
5. Discovery submission (manual, one-time): Google Search Console + Bing Webmaster — verify `base-mind.vercel.app`, submit `https://base-mind.vercel.app/sitemap.xml`, request indexing of `/`. Exact steps in `AI_DISCOVERABILITY_FRAMEWORKS.md`.
6. Check Render + Vercel logs for request-log lines and any 5xx spikes.

## Swapping the Clerk dev instance
1. Create new application at dashboard.clerk.com.
2. Update publishable key in Vercel (+ local) → redeploy frontend.
3. Update `CLERK_JWKS_URL` + `CLERK_ISSUER` in Render to the NEW instance domain → redeploy backend.
4. Old tokens/cookies are invalid; users just log in again.

## Planned
- Production Clerk instance with custom domain for a real launch (dev instance `secure-griffon-2008` suffices for evaluation).
