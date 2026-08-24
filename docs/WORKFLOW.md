# Workflow

## Session loop (how this repo is developed)
1. **Recall** past context before starting non-trivial work.
2. Implement in small, verifiable increments; every failure mode surfaces an exact-reason message to the user.
3. Verify: `npm run build` must pass before any push.
4. Commit per logical unit; push to `main`; Vercel + Render auto-deploy.
5. Save decisions/gotchas back to memory/docs when discovered.

## Branching
- Single-branch flow on `main` for solo dev.
- Feature work happens directly with focused commits; each commit message states the user-visible behavior.

## Verification ladder
| change | check |
|---|---|
| frontend code | `npm run build` clean |
| backend code | local uvicorn boot + endpoint curl |
| auth changes | fake-token 401 detail test against live API |
| RAG changes | upload → chunk count → chat cites source |
| deploy | `/api/health` → login → dashboard loads |

## Phase status
- **Phase 1 — Auth + CRUD**: done (Clerk login/signup/OAuth, agents CRUD, dashboard).
- **Phase 2 — RAG pipeline**: done (upload+embed+pgvector search, SSE streaming chat with sources, Agent Studio instructions/color, real KB uploads).
- **Phase 3 — planned**: URL crawler ingestion ("Sync URL"), Backblaze B2 large-file storage, deeper analytics, production Clerk instance with custom domain.
