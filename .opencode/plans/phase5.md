# Phase 5 — Completion plan (approved)

Goal: close every gap between the shipped product (Phases 1–4) and a polished, launch-ready
SaaS with **zero spend** (Clerk dev instance + Render free tier retained).

## Decisions locked at kickoff
- No spend, no Stripe. Pricing is marketing-only; all landing CTAs route to `/signup`.
- Settings: build a lightweight real page (Profile, Service Status, Danger Zone).
- Delete workspace included per user request: `DELETE /api/me` purges all data + B2 originals.

## Milestones
### 5A — Legal + Landing truth
- `/legal/privacy`, `/legal/terms` static pages; footer links; added to `sitemap.ts`.
- Landing CTAs (`page.tsx` "Get Started", "Start Free Trial") `/dashboard` → `/signup`.
- commit `9fcf086`

### 5B — Settings + onboarding + delete workspace
- `DELETE /api/me` (204): wipe conversations/messages, documents (chunks cascade) + their B2
  originals (best-effort), agents, `users` row → idempotent (fresh row upserts on next login).
- `GET /api/settings/status` → `{db_configured, b2_enabled}`.
- Real `/settings` page: Clerk profile, service status, Danger Zone with typed-confirm (`DELETE`).
- Dashboard onboarding checklist card (data-driven, only for empty workspaces; no fake seeding).
- commit `a0a086a`

### 5C — Conversation delete + hardening
- `DELETE /api/conversations/{id}` (204) + sidebar trash button (confirm, clears selection).
- Chat rate limit: in-memory sliding window, 20 per user per 5 min → `429` exact-reason.
- Logging: request-log middleware (`basemind.http`, chat streaming excluded) + `logger.exception`
  on chat/persist/B2/B2-upload failure paths.
- commit `8eaf608`

### 5D — Launch ops + final regression
- DEPLOYMENT.md soft-launch checklist (includes manual GSC/Bing discovery submission steps).
- Full suite **50/50**, `npm run build`, lint 0 errors, all CI runs green.

## Verification ladder (per milestone)
`compileall` → functional suite (temp `test_all.py`) → `npm run build` → lint → commit per unit
→ push → confirm GitHub Actions success for the commit.