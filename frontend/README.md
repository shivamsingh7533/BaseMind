# BaseMind Frontend (Next.js 16 App Router)

The BaseMind web application is built with **Next.js 16** (App Router, Turbopack), **TypeScript**, **React 19**, and **Tailwind CSS**. It powers the public marketing pages, workspace management studio, live operator chat console, and embeddable visitor chat widgets.

---

## 🧭 Page Routes & Architecture

### Public Marketing & Legal Pages
- `/` — High-converting landing page with live interactive demo preview and modern footer.
- `/features` — In-depth breakdown of RAG, Human-in-the-Loop, and Multi-channel bots.
- `/pricing` — Interactive pricing plans (Hobby, Starter, Pro), feature comparison, and FAQ.
- `/legal/privacy` — Comprehensive privacy policy and data retention disclosures.
- `/legal/terms` — Terms of service and platform acceptable use agreement.

### Authentication (Clerk)
- `/login/[[...rest]]` — Dedicated branded sign-in portal.
- `/signup/[[...rest]]` — Registration and tenant onboarding.
- `/sso-callback` — Single sign-on redirect handler.

### Workspace Studio (Protected via Middleware)
- `/dashboard` — Workspace overview, quick stats, onboarding checklist, and recent activity.
- `/agents` — Agent builder, custom instruction editor, widget styling, and white-label branding.
- `/knowledge-base` — Multi-source file upload (PDF/TXT/CSV/MD), web crawler URL sync, and Backblaze B2 downloads.
- `/chat` — Interactive chat studio with filter tabs (All, Escalated, Takeover, AI), operator mode, and thread inspection.
- `/leads` — Inbound lead capture CRM table with filtering and CSV export.
- `/analytics` — Resolution rates, sentiment analysis, CSAT scores, and knowledge gap reports.
- `/settings` — Tenant isolation status, Backblaze B2 status, and permanent workspace deletion.
- `/logs` — Real-time system event audit stream.
- `/ops` — Super-admin platform operations console (restricted by `OPERATOR_EMAILS`).

### Standalone Embeddable Widget
- `/widget/[agentId]` — Responsive standalone chat widget optimized for iframe embedding or direct customer links. Features starter questions, lead capture modals, and human handover escalation.

---

## 🛠️ Key Components & Libraries

- **`src/components/footer.tsx`**: Enterprise 5-column responsive footer with live system health pinging `https://basemind-api.onrender.com/api/health`.
- **`src/components/chat-bubble.tsx`**: Chat message bubble supporting user, bot, and operator turns with markdown and source citation chips.
- **`src/app/(app)/chat/components/`**: Operator studio components (`conversation-list.tsx`, `chat-header.tsx`, `composer.tsx`, `inspector.tsx`).
- **`src/lib/api/`**: Strongly-typed API client and Zod validation schemas.
- **`src/lib/store.ts`**: Zustand state management with in-memory TTL caching.

---

## 💻 Local Development

### Prerequisites
- Node.js 20+
- npm 10+

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (.env.local)
cp .env.example .env.local
```

Required variables in `.env.local`:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Running Locally

```bash
# Start development server on port 3000
npm run dev

# Run ESLint validation
npm run lint

# Build production bundle with Turbopack
npm run build
```
