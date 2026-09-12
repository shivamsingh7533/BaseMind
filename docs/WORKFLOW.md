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
- **Phase 4 — all done**: chat sources carry `docId`; document `download` (302) / `download-url` (JSON) / `preview` (~2 KB) endpoints; `delete_document` B2 cleanup; `PATCH` status incl `halted`/`reopen`; **Chat page** (`/chat`) with history, live SSE, retry + follow-ups, sources view/download, resolve/halt; **Knowledge Base rows** now Open/Download + Delete; **Dashboard** adds Agent Performance table (convs/msgs/resolved/latency) + 7-day CSS trend bars; **CI** (`.github/workflows/ci.yml`) + `render.yaml` declares B2 env (`sync: false`) + `restartPolicy: web`.
- **Phase 5 — in progress, 5A done**: **Privacy + Terms pages** (`/legal/privacy`, `/legal/terms`) linked in the landing footer + added to sitemap; landing CTAs ("Start Free Trial", "Get Started") now route to `/signup` instead of leaking into the app's auth redirect. Next: 5B real Settings + Delete workspace (`DELETE /api/me`), 5C conversation delete + chat rate limit + logging, 5D launch ops + final regression.
