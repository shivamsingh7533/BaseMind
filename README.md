<p align="center">
  <img src="./frontend/public/logo.svg" alt="BaseMind Logo" width="110"/>
</p>

<h1 align="center">🧠 BaseMind — Autonomous Multi-Channel AI Customer Support & RAG Platform</h1>

<p align="center">
  <strong>Deploy Grounded AI Support Agents · Ingest Multi-Source Knowledge · Seamlessly Hand Over to Human Operators</strong>
</p>

<p align="center">
  <a href="https://base-mind.vercel.app/">
    <img src="https://img.shields.io/badge/🌐_Live_Demo-Visit_Now-0D9488?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo"/>
  </a>
  <a href="https://github.com/shivamsingh7533/BaseMind">
    <img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"/>
  </a>
  <a href="https://basemind-api.onrender.com/api/health">
    <img src="https://img.shields.io/badge/⚡_API_Status-Operational-22C55E?style=for-the-badge&logo=fastapi&logoColor=white" alt="API Status"/>
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.3.2-black?style=flat-square&logo=next.js&logoColor=white"/>
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react&logoColor=black"/>
  <img src="https://img.shields.io/badge/TailwindCSS-4.x-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white"/>
  <img src="https://img.shields.io/badge/FastAPI-Python_3.12-009688?style=flat-square&logo=fastapi&logoColor=white"/>
  <img src="https://img.shields.io/badge/PostgreSQL-Neon_pgvector-336791?style=flat-square&logo=postgresql&logoColor=white"/>
  <img src="https://img.shields.io/badge/Google_Gemini-2.5_Flash_RAG-4285F4?style=flat-square&logo=google&logoColor=white"/>
  <img src="https://img.shields.io/badge/Auth-Clerk_JWT-6C47FF?style=flat-square&logo=clerk&logoColor=white"/>
  <img src="https://img.shields.io/badge/Storage-Backblaze_B2-D32F2F?style=flat-square&logo=backblaze&logoColor=white"/>
</p>

---

## 📖 Overview

**BaseMind** is a production-grade, multi-tenant AI customer support and conversational automation platform. Designed for fast-growing SaaS products, e-commerce stores, and digital agencies, BaseMind bridges the gap between hallucination-free generative AI and human customer service teams.

With BaseMind, businesses can connect documentation, knowledge bases, and live web pages to deploy autonomous AI agents across web widgets, Slack, and Discord. When a customer inquiry requires nuanced human intervention, BaseMind's real-time **Human-in-the-Loop Handover System** instantly pauses the bot, alerts workspace operators via instant email, and provides a live operator chat console for seamless human takeover.

---

## ✨ Key Features

### 🧠 **Grounded Gemini 2.5 RAG Engine**
- 📄 **Multi-Format Document Ingestion**: Upload PDF, TXT, CSV, and Markdown files up to 10 MB.
- 🌐 **Async Web Crawler**: Scrapes live website URLs, cleans markup, and auto-syncs knowledge bases.
- ⚡ **pgvector Cosine Similarity**: High-performance 768-dimensional vector indexing (`gemini-embedding-001`).
- 🔍 **Real-Time Citation Links**: Every AI response streams with verifiable source badges pointing to exact chunks.
- 🔒 **Encrypted Cloud Storage**: Original uploaded files stored securely in private Backblaze B2 buckets with short-lived signed download URLs.

### 🎧 **Human-in-the-Loop Live Takeover & Handover**
- 🙋‍♂️ **Visitor "Talk to Human" Trigger**: One-click escalation button inside the visitor chat widget.
- 🗣️ **Natural Language Intent Detection**: Phrases like *"I want to talk to an agent"* or *"real person"* automatically escalate threads.
- ⏸️ **Instant Bot Generation Pause**: Automatically enters `needs_human` queue to prevent conflicting bot replies.
- 👩‍💼 **Live Operator Console**: Support agents claim conversations (`in_takeover`), reply using operator names, and return threads to the AI with one click.
- 🔄 **Real-Time Polling Engine**: 3-second background polling keeps visitor widget and operator dashboard in sync without page refreshes.

### 💬 **Multi-Channel Messaging Bots**
- 💼 **Slack App Integration**: Bidirectional webhook bot answering `app_mention` and DM queries in Slack channels.
- 🎮 **Discord Bot Integration**: Ed25519 cryptographic verification for slash commands and server inquiries.

### 🌐 **Embeddable Customer Chat Widget**
- 📦 **One-Line Web Embed**: Add to any website via `<script>` tag or standalone iframe (`/widget/{agentId}`).
- 🎨 **Full Visual Customization**: Custom primary colors, avatar, starter questions, and greeting cards.
- 🛡️ **Allowed Domains Sandboxing**: Restrict widget initialization strictly to authorized customer domains.

### 🎯 **Lead Capture CRM & Pipeline**
- 📋 **In-Chat Lead Forms**: Capture visitor name, email, phone number, company, and message before or during chat.
- 📊 **Dedicated Leads CRM**: Filter leads by status (`new`, `contacted`, `converted`, `dismissed`) and associated agent.
- 📥 **One-Click CSV Export**: Export captured leads formatted for HubSpot, Salesforce, or Google Sheets.

### 🏷️ **White-Label & Custom Branding (Pro)**
- 🏢 **Custom Brand Attribution**: Replace *"Powered by BaseMind"* with custom branding (e.g., *"Powered by Acme Support"*).
- 🚫 **Complete Branding Removal**: Option to remove platform footer branding entirely on Pro plans.

### 🔐 **Authentication & Multi-Tenant Security**
- 🔑 **Clerk JWT Authentication**: Robust session verification with 60-second clock-drift leeway and JWKS auto-derivation.
- 🛡️ **Row-Level Tenant Isolation**: All queries strictly scoped by `user_id` with foreign key cascade deletions.
- 🧨 **Ephemeral Workspace Purge**: One-click GDPR-compliant workspace wipe (`DELETE /api/me`) that purges all database rows and B2 files.

### 📬 **Instant Transactional Email Notifications**
- ⚡ **Real-Time Alerts**: Asynchronous email notifications to workspace owners via Resend/SMTP when escalations occur or new leads arrive.
- ⏱️ **Intelligent Rate-Limiting**: 2-minute escalation cooldown and 1-minute lead cooldown prevent notification spam.

### 📊 **Operational Analytics & Knowledge Gaps**
- 📈 **Resolution & Sentiment Metrics**: Track conversation volume, average resolution latency, CSAT scores, and user sentiment.
- ❓ **Automated Knowledge Gap Detection**: Flags unanswered queries with low semantic match confidence so admins can update documentation.

---

## 👥 Role-Based Access & Operating Modes

| Role / Mode | Capabilities |
|---|---|
| **Visitor / Customer** | Chats via embeddable widget, requests human handover, submits lead details, views source citations |
| **Autonomous AI Bot** | Answers questions grounded on vector knowledge base, detects escalation intent, streams SSE responses |
| **Human Operator** | Views escalated conversations queue, claims live takeover, chats directly with visitors, returns thread to AI |
| **Workspace Admin** | Creates/configures agents, uploads knowledge files, syncs web URLs, manages leads CRM, views analytics |
| **Platform Operator (Super-Admin)**| Accesses `/ops` console (guarded by `OPERATOR_EMAILS`), views multi-tenant trends, system health, and error logs |

---

## 🛠️ Tech Stack

### **Frontend**
| Technology | Purpose |
|---|---|
| [Next.js 16](https://nextjs.org/) | React App Router Framework (Turbopack, Server & Client Components) |
| [React 19](https://react.dev/) | Core UI Library |
| [TypeScript 5](https://www.typescriptlang.org/) | End-to-end static type safety |
| [Tailwind CSS 4](https://tailwindcss.com/) | Modern utility-first CSS styling & responsive layouts |
| [Clerk](https://clerk.com/) | Authentication, JWT session tokens, and route protection |
| [Zustand](https://github.com/pmndrs/zustand) | Global client-side state management with TTL caching |
| [Lucide React](https://lucide.dev/) | Clean, modern iconography |
| [Sonner](https://sonner.emilkowal.ski/) | Toast notification system with detailed error messages |

### **Backend & Cloud Infrastructure**
| Technology | Purpose |
|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | High-performance asynchronous Python REST & SSE web framework |
| [Neon PostgreSQL](https://neon.tech/) | Serverless PostgreSQL 16 database |
| [pgvector](https://github.com/pgvector/pgvector) | Vector similarity search using 768-dimensional embeddings |
| [Google Gemini 2.5 Flash](https://ai.google.dev/) | Generative AI foundation model for streaming answers |
| [Google Gemini Embeddings](https://ai.google.dev/) | `gemini-embedding-001` text embedding generation |
| [Backblaze B2](https://www.backblaze.com/b2/) | Private, S3-compatible cloud object storage for source documents |
| [SQLAlchemy 2.0](https://www.sqlalchemy.org/) & [Alembic](https://alembic.sqlalchemy.org/) | Async ORM & automated database migrations |
| [PyPDF](https://pypi.org/project/pypdf/) & [HTTPX](https://www.python-httpx.org/) | Document text extraction and asynchronous web crawling |
| [Resend / Brevo](https://www.brevo.com/) | Asynchronous transactional email alerts for escalations & leads |
| [Vercel](https://vercel.com/) | Global Edge CDN hosting for Next.js frontend |
| [Render](https://render.com/) | Managed cloud hosting for FastAPI backend service |

---

## 🏗️ Architecture & Data Flow

```mermaid
graph TD
    subgraph Client Layer
        A[Website Visitor] -->|Embed Widget / Standalone| B(Public Chat API)
        C[Slack User] -->|Slack Events API| D(Slack Webhook)
        E[Discord User] -->|Interactions API| F(Discord Webhook)
        G[Support Operator] -->|Next.js Studio| H(Operator Console)
    end

    subgraph API Gateway (FastAPI on Render)
        B & D & F & H --> I{Routing & Auth Guard}
        I -->|Clerk JWT / Webhook Sig| J[Verified Handlers]
    end

    subgraph Core Engines
        J -->|Document Upload / URL Sync| K[Ingestion & Chunking Pipeline]
        J -->|RAG Question| L[pgvector Cosine Search]
        J -->|Escalation Request| M[Handover State Machine]
        J -->|Lead Capture| N[Leads CRM Pipeline]
    end

    subgraph Storage & AI Services
        K -->|Embeddings| O[(Neon PostgreSQL + pgvector)]
        K -->|Raw File Archive| P[(Backblaze B2 Storage)]
        L -->|Context Chunks| Q[Google Gemini 2.5 Flash]
        Q -->|Stream Tokens & Citations| B
        M -->|Instant Notification| R[Owner Email Inbox]
    end
```

---

## 📡 Key API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Live service health check (DB + Backblaze B2 status) |
| `GET` | `/api/agents` | List workspace AI agents |
| `POST` | `/api/agents` | Create new agent with custom instructions and colors |
| `PATCH` | `/api/agents/{id}` | Update agent configuration, status, or white-label branding |
| `POST` | `/api/documents/upload` | Upload & chunk PDF/TXT/CSV/MD with Gemini embeddings |
| `POST` | `/api/documents/sync` | Scrape and ingest external web URLs into knowledge base |
| `GET` | `/api/documents/{id}/download-url` | Generate Backblaze B2 signed download URL |
| `POST` | `/api/conversations/{id}/chat` | SSE streaming AI chat with inline citations |
| `POST` | `/api/conversations/{id}/takeover` | Human operator claims conversation |
| `POST` | `/api/conversations/{id}/return-to-ai` | Operator returns thread back to AI bot |
| `GET` | `/api/public/agents/{id}` | Public widget configuration & branding |
| `POST` | `/api/public/conversations/{id}/chat` | Public visitor streaming chat & escalation detection |
| `POST` | `/api/public/conversations/{id}/handover` | Visitor triggers human handover request |
| `POST` | `/api/public/agents/{id}/leads` | Public lead capture form submission |
| `GET` | `/api/leads` | List captured leads with filter and search |
| `POST` | `/api/leads/export` | Export leads in CSV format |
| `POST` | `/api/integrations/slack/events` | Bidirectional Slack events webhook listener |
| `POST` | `/api/integrations/discord/interactions`| Discord slash command webhook listener |
| `GET` | `/api/dashboard` | Aggregated analytics, 7-day trends, and activity |

*For complete parameters, request bodies, and error formats, see [docs/API.md](docs/API.md).*

---

## 🚀 Getting Started

### Prerequisites
- **Python**: `3.11` or higher
- **Node.js**: `20.x` or higher
- **PostgreSQL**: Version 16 with `pgvector` extension enabled ([Neon](https://neon.tech) recommended)
- **Google Gemini API Key**: ([Google AI Studio](https://aistudio.google.com/))
- **Clerk Account**: ([Clerk Dashboard](https://clerk.com/))

---

### 1. Backend Setup

```bash
# Clone the repository
git clone https://github.com/shivamsingh7533/BaseMind.git
cd BaseMind/backend

# Create and activate Python virtual environment
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
```

Edit `.env` with your credentials:
```env
DATABASE_URL=postgresql+asyncpg://[user]:[password]@[host]/neondb?ssl=require
CLERK_JWKS_URL=https://<instance>.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://<instance>.clerk.accounts.dev
GEMINI_API_KEY=your_gemini_api_key
B2_APPLICATION_KEY_ID=your_b2_key_id
B2_APPLICATION_KEY=your_b2_secret_key
B2_BUCKET_NAME=BaseMind
ALLOWED_ORIGINS=http://localhost:3000
```

Apply database migrations and start the server:
```bash
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
API will run at `http://localhost:8000` with Swagger docs at `http://localhost:8000/docs`.

---

### 2. Frontend Setup

```bash
cd ../frontend

# Install node dependencies
npm install

# Configure environment variables
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🌐 Production Deployment

- **Frontend**: Connect your GitHub repository to [Vercel](https://vercel.com). Vercel will automatically build and deploy the Next.js 16 app.
- **Backend**: Deploy as a Web Service on [Render](https://render.com) using the `backend/` directory, pointing the start command to `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- **Database**: Serverless PostgreSQL on [Neon](https://neon.tech) with automatic scaling and zero cold-starts.
- **Object Storage**: Private bucket on [Backblaze B2](https://www.backblaze.com/b2/).

*For step-by-step production checklists, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).*

---

## 📄 License & Author

Distributed under the **MIT License**. See `LICENSE` for more information.

Created with ❤️ by **[Shivam Singh](https://github.com/shivamsingh7533)**.
