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
- **Phase 3 — URL sync + analytics + B2**: done (URL crawler ingestion, real analytics deltas/activity/web-vs-file, B2 raw-original storage, npm start). Production Clerk instance with custom domain **pending (needs paid plan + domain)**.
- **Phase 4 — in progress, milestones 4A + 4B done**: chat sources carry `docId`; `GET /api/documents/{id}/download` (302 → signed B2 URL / source URL) + JSON `download-url` (for browser tabs) + `preview` (first ~2 KB of chunks); dashboard adds `perAgent[]` + `trend7d[]`; `delete_document` cleans up its B2 object; `PATCH /api/conversations/{id}` accepts `halted`/`reopen`; new **Chat page** (`/chat`) — conversation sidebar + New chat, full history on select/reload, live SSE with retry + follow-up chips, sources dialog View/Download, resolve/halt/reopen controls. Next: 4C KB rows Download/Open + dashboard per-agent rows & 7-day bars, then 4D CI/CD (.github/workflows + render.yaml B2 env).
