# Edge Cases & Known Gotchas

## Auth
- **401 detail strings are diagnostic.** Backend tells exactly why: missing token, issuer mismatch (shows token `iss` vs env), expired, signature invalid (wrong JWKS instance), JWKS unreachable.
- Clerk dev instances can return 500 on `/v1/client/tokens` when instance state is sick — fix is a fresh session or a brand-new dev instance; not a code bug.
- Expired session tokens surface as "Login session nahi mili" toast — refresh page.

## Render free tier
- Sleeps after ~15 min idle → browser fetch fails with network error before HTTP is ever reached. Frontend shows "Render jaag raha hoga, dobara try karo". Mitigation: open the site once, wait for dashboard data, then act.
- Cold start also delays uploads; upload has a 120 s abort timeout with its own toast.

## Uploads
- Hard limit 10 MB (FastAPI rejects larger).
- Only PDF/TXT/CSV/MD accepted; other extensions rejected server-side.
- Empty/scanned-image PDFs yield zero text → zero chunks; doc row still appears with 0 chunks (no error thrown).

## Gemini
- Model availability differs per key age: `gemini-3.6-flash` works; older `gemini-2.5-flash` may be blocked for new keys; `text-embedding-004` retired for new keys.
- SDK quirks: `client.aio.models.list()` pager needs `await`; streaming call needs `await` before async-for.
- Occasional 503 model overload → chat surfaces error event; retry usually succeeds.

## CORS
- Preflight verified for `https://base-mind.vercel.app`; wildcard subdomain regex covers preview URLs. Missing origin in `ALLOWED_ORIGINS` manifests as silent fetch failures client-side.

## Data
- Zustand store seeds empty arrays so first paint never crashes if API fails silently; TTL cache prevents refetch storms.
- Deleting an agent cascades nothing in documents (docs are user-scoped, not agent-scoped).
- User deleted all Neon rows during testing → app must handle empty users table gracefully (it does; upsert recreates on next login).
