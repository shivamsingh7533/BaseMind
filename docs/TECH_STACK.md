# BaseMind Technology Stack

BaseMind combines modern web technologies, asynchronous Python web services, serverless vector databases, and state-of-the-art Google Gemini foundation models.

---

## Core Technologies Inventory

| Layer / Domain | Technology | Version / Spec | Purpose & Notes |
|---|---|---|---|
| **Frontend Framework** | Next.js (App Router) | `16.3.2` | Server Components, Turbopack, Dynamic Routes (`/widget/[agentId]`, `/legal/*`) |
| **Language & Runtime** | TypeScript & React | `React 19`, `TS 5.x` | Strict type safety, Client/Server boundary separation |
| **Styling & Design System**| Tailwind CSS & shadcn/ui | Modern CSS Variables | Glassmorphism, tailored dark mode, responsive layout system |
| **Component Icons** | Lucide React | Modern SVG icons | Streamlined UI iconography with custom SVG brand assets |
| **Client State Management**| Zustand | TTL-cached stores | In-memory caching for agents, knowledge docs, and conversation feeds |
| **User Authentication** | Clerk | `@clerk/nextjs` | Multi-tenant JWT auth, session management, route middleware protection |
| **Backend Framework** | FastAPI (Python) | `Python 3.11+ / 3.12+` | High-performance async ASGI server, Pydantic v2 validation |
| **Database & Vector Engine**| Neon PostgreSQL | `PostgreSQL 16` | Serverless Postgres with `pgvector` extension for vector indexing |
| **ORM & Migrations** | SQLAlchemy 2.0 & Alembic | `asyncpg` driver | Fully asynchronous connection pooling and versioned migrations |
| **RAG Embeddings** | Google Gemini Embeddings | `gemini-embedding-001` | 768-dimensional normalized text embeddings |
| **Generative AI Chat** | Google Gemini Foundation | `gemini-2.5-flash` | Ultra-low latency Server-Sent Events (SSE) streaming with citations |
| **Document Ingestion** | PyPDF & HTMLParser | `pypdf`, `httpx` | PDF extraction, raw text parser, and live URL crawler |
| **Object Storage** | Backblaze B2 | `b2sdk` (S3 Compatible) | Private encrypted bucket storage for raw documents with signed URLs |
| **Multi-Channel: Slack** | Slack Events API | HMAC-SHA256 | Bidirectional bot responses to `app_mention` and DM events |
| **Multi-Channel: Discord** | Discord Interactions API | Ed25519 signature | Webhook-driven bot answering slash commands in servers |
| **Live Agent Handover** | Event Polling Engine | State Machine | Automated bot pauses token generation; operator claims conversation |
| **Transactional Emails** | Resend / Brevo / SMTP | Asynchronous Tasks | Immediate notifications for escalations and new leads with cooldowns |
| **Telemetry & Metrics** | Prometheus & Sentry | `prometheus-fastapi-instrumentator` | Latency tracing, route metrics (`/metrics`), and crash diagnostics |
| **Web Hosting** | Vercel | Production CDN | Automated Git deploys, Edge middleware, custom routing |
| **API Hosting** | Render | Managed Web Service | Continuous deployment, automated health checks (`/api/health`) |
