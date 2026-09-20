# Production Deployment Guide

BaseMind is architected for zero-downtime continuous deployment using **Vercel** (Frontend) and **Render** (Backend API), backed by **Neon** (PostgreSQL + pgvector) and **Backblaze B2** (Encrypted Object Storage).

---

## Production Topology & Endpoints

| Service | Host / Platform | Production URL |
|---|---|---|
| **Web Frontend** | Vercel (Edge + Node.js) | [base-mind.vercel.app](https://base-mind.vercel.app) |
| **Backend REST & SSE API** | Render (Web Service) | [basemind-api.onrender.com](https://basemind-api.onrender.com) |
| **Database** | Neon (Serverless Postgres) | `postgresql+asyncpg://...@...neon.tech/neondb?ssl=require` |
| **Object Storage** | Backblaze B2 (Private S3) | Bucket `BaseMind` |
| **Authentication** | Clerk (JWT Session Provider) | Production Clerk Dashboard |

---

## Environment Variables Configuration

### 1. Frontend (Vercel & Local `.env.local`)

| Variable | Description | Example / Required Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of FastAPI backend | `https://basemind-api.onrender.com` (Prod) / `http://localhost:8000` (Local) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key | `pk_live_...` (Prod) / `pk_test_...` (Dev) |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side Sentry error tracking (Optional) | `https://...@o...ingest.sentry.io/...` |

---

### 2. Backend (Render & Local `.env`)

#### Database & Authentication
| Variable | Description | Production Setting |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL async connection string | `postgresql+asyncpg://[user]:[password]@[host]/neondb?ssl=require` |
| `CLERK_JWKS_URL` | Clerk JWKS public key endpoint | `https://<instance>.clerk.accounts.dev/.well-known/jwks.json` |
| `CLERK_ISSUER` | Expected JWT issuer (with or without trailing slash) | `https://<instance>.clerk.accounts.dev` |
| `ALLOWED_ORIGINS` | Permitted CORS client origins | `https://base-mind.vercel.app,http://localhost:3000` |

#### AI & RAG Engine
| Variable | Description | Production Setting |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key | Key with permissions for `gemini-2.5-flash` and `gemini-embedding-001` |

#### Backblaze B2 Storage
| Variable | Description | Production Setting |
|---|---|---|
| `B2_APPLICATION_KEY_ID` | Backblaze Application Key ID | Private scoped key |
| `B2_APPLICATION_KEY` | Backblaze Application Key secret | Secret key |
| `B2_BUCKET_NAME` | Storage bucket name | `BaseMind` |

#### Transactional Email Alerts (Resend / Brevo / SMTP)
| Variable | Description | Production Setting |
|---|---|---|
| `BREVO_ENABLED` | Toggle email alert dispatching | `1` (or `true`) |
| `BREVO_API_KEY` | SMTP or transactional email API key | Active API key |
| `BREVO_SENDER_EMAIL` | Verified sender email address | `support@yourdomain.com` |
| `BREVO_SENDER_NAME` | Display name on email alerts | `BaseMind Support` |

#### Observability & Super-Admin Console
| Variable | Description | Production Setting |
|---|---|---|
| `SENTRY_DSN` | Sentry DSN for backend exception reporting | `https://...@ingest.sentry.io/...` |
| `OPERATOR_EMAILS` | Comma-separated emails allowed into `/ops` and `/admin` | `admin@yourdomain.com,owner@yourdomain.com` |

---

## Database Migrations (Alembic)

BaseMind uses Alembic to manage database schema evolutions. Migrations must be run whenever schema changes occur:

```bash
cd backend
alembic upgrade head
```

### Automated Boot DDL Guards:
In addition to Alembic, the backend engine (`backend/app/db.py`) executes idempotent DDL checks on startup (`CREATE EXTENSION IF NOT EXISTS vector;`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`), ensuring that cold boots on Render never crash due to missing columns or race conditions.

---

## Deployment & Verification Checklist

### Pre-Deployment
1. Run local tests:
   ```bash
   cd backend && pytest tests/
   cd ../frontend && npm run lint && npm run build
   ```
2. Confirm both jobs pass with 0 errors.

### Deploying
1. Commit and push to the `main` branch on GitHub:
   ```bash
   git push origin main
   ```
2. GitHub Webhook triggers automated builds:
   - **Vercel**: Compiles Next.js 16 app with Turbopack and pushes to edge CDN.
   - **Render**: Rebuilds Python container, runs pip installs, and boots Uvicorn worker.

### Post-Deployment Smoke Test
1. **Health Check**:
   ```bash
   curl -s https://basemind-api.onrender.com/api/health
   # Expected: {"status": "ok", "service": "basemind-api", "checks": {"db": {"status": "ok"}, "b2": {"status": "ok"}}}
   ```
2. **Auth Verification**:
   - Log into `https://base-mind.vercel.app/login`.
   - Verify `/dashboard` renders with live statistics and no 401 toast notifications.
3. **RAG Chat Test**:
   - Open `/chat`, select an agent, and send a message. Verify Server-Sent Events stream answers with citations.
4. **Public Widget Test**:
   - Open `/widget/{agentId}` in an incognito window.
   - Send a query, click "Talk to Human", and verify that the status updates to *"Connecting to a human operator..."*.
   - Check the operator studio to confirm the conversation appears in the **Escalated** queue.
