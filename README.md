# BaseMind AI SaaS Platform

Full-stack demo generated from the Stitch "BaseMind AI SaaS Platform" designs.

- **Frontend:** Next.js 16 (App Router) · TypeScript · React 19 · Tailwind CSS v4 · shadcn/ui
- **Backend:** Python · FastAPI

## Project structure

```
frontend/   Next.js app (landing + dashboard/agents/knowledge/logs/settings)
backend/    FastAPI server serving mock data
stitch/     Original Stitch screen exports (HTML + screenshots) and design tokens
```

## Run it

### 1. Backend (port 8000)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows (Git Bash: source .venv/Scripts/activate)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs

### 2. Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 — landing page at `/`, app at `/dashboard`.

## API endpoints

| Method | Path                        | Description                    |
| ------ | --------------------------- | ------------------------------ |
| GET    | `/api/health`               | Health check                   |
| GET    | `/api/dashboard`            | Stats + recent activity        |
| GET    | `/api/agents`               | Deployed bots                  |
| GET    | `/api/documents`            | Knowledge base sources         |
| GET    | `/api/conversations`        | Chat sessions w/ transcripts   |

The frontend falls back to bundled seed data (`src/lib/seed-data.ts`) if the
API is unreachable, so UI pages always render.

## Configuration

- `NEXT_PUBLIC_API_URL` — override the backend URL (default `http://localhost:8000`).
