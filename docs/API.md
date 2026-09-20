# BaseMind API Reference

**Base URL**: `https://basemind-api.onrender.com` (Production) / `http://localhost:8000` (Local)  
**Authentication**: Most private endpoints require an `Authorization: Bearer <Clerk_Session_JWT>` header.  
**Public Endpoints**: Routes under `/api/public/*`, `/api/health`, and integration webhook callbacks (`/api/integrations/slack/*`, `/api/integrations/discord/*`) are accessible without user session tokens.

---

## 1. System Health

### `GET /api/health`
Checks operational status of the API, Neon PostgreSQL database, and Backblaze B2 storage connectivity.
- **Auth**: None
- **Response**: `200 OK`
```json
{
  "status": "ok",
  "service": "basemind-api",
  "checks": {
    "db": { "status": "ok" },
    "b2": { "status": "ok" }
  },
  "latency_ms": 14.2
}
```

---

## 2. AI Agents & White-Label Customization

### `GET /api/agents`
Lists all agents created by the authenticated user.
- **Auth**: Bearer token
- **Response**: `200 OK` — Array of `Agent` objects.

### `POST /api/agents`
Creates a new AI agent.
- **Auth**: Bearer token
- **Request Body**:
```json
{
  "name": "Customer Care Pro",
  "url": "https://example.com",
  "instructions": "Answer user questions politely using only the provided knowledge base.",
  "color": "#0d9488",
  "greeting_message": "Hello! How can I help you today?",
  "suggested_questions": ["What are your pricing plans?", "How do I reset my password?"],
  "allowed_domains": "example.com,app.example.com",
  "lead_capture_enabled": true,
  "lead_capture_title": "Leave your details for our team",
  "hide_branding": false,
  "custom_brand_name": ""
}
```
- **Response**: `201 Created` — Created `Agent` object.

### `PATCH /api/agents/{id}`
Updates an agent's configuration, instructions, status (`active` / `paused`), or white-label branding.
- **Auth**: Bearer token
- **Request Body**: Any subset of writable agent fields, e.g.:
```json
{
  "status": "active",
  "hide_branding": true,
  "custom_brand_name": "Acme Support AI"
}
```
- **Response**: `200 OK`

### `DELETE /api/agents/{id}`
Deletes the agent and all associated document links, leads, and integration configurations.
- **Auth**: Bearer token
- **Response**: `204 No Content`

---

## 3. Knowledge Base & Document Ingestion

### `GET /api/documents`
Lists all documents ingested into the user's workspace.
- **Auth**: Bearer token
- **Response**: `200 OK` — Array of `Document` objects.

### `POST /api/documents/upload`
Uploads a physical file, stores it in Backblaze B2, chunks the text, computes 768-dim embeddings via Google Gemini (`gemini-embedding-001`), and stores vectors in Neon PostgreSQL.
- **Auth**: Bearer token
- **Content-Type**: `multipart/form-data`
- **Form Fields**: `file` (Max 10 MB. Supported: PDF, TXT, CSV, Markdown), optional `agent_id`.
- **Response**: `201 Created`
```json
{
  "id": "c1f76d90-3492-4f11-82ef-d757d5402431",
  "name": "Refund_Policy_2026.pdf",
  "type": "PDF",
  "detail": "indexed, 14 chunks",
  "status": "ready",
  "storageKey": "users/user_abc/docs/Refund_Policy_2026.pdf"
}
```

### `POST /api/documents/sync`
Asynchronous web crawler that fetches an external web page, extracts readable text, chunks it, and indexes vector embeddings.
- **Auth**: Bearer token
- **Request Body**:
```json
{
  "url": "https://help.example.com/getting-started",
  "agent_id": "optional-agent-uuid"
}
```
- **Response**: `201 Created`

### `GET /api/documents/{id}/download-url`
Generates a secure, short-lived signed URL to download the original uploaded file from Backblaze B2.
- **Auth**: Bearer token
- **Response**: `200 OK`
```json
{
  "url": "https://f002.backblazeb2.com/file/BaseMind/users/user_abc/docs/Refund_Policy_2026.pdf?..."
}
```

### `GET /api/documents/{id}/preview`
Returns readable text preview (first ~2 KB) extracted from document chunks.
- **Auth**: Bearer token
- **Response**: `200 OK`

### `DELETE /api/documents/{id}`
Removes the document, cascades chunk deletions from `document_chunks`, and best-effort removes the original file from Backblaze B2.
- **Auth**: Bearer token
- **Response**: `204 No Content`

---

## 4. Conversations & Live Operator Takeover

### `GET /api/conversations`
Lists conversations owned by the workspace.
- **Auth**: Bearer token
- **Query Params**: `status` (`active`, `resolved`, `halted`, `needs_human`, `in_takeover`), `agent_id`.
- **Response**: `200 OK`

### `GET /api/conversations/{id}`
Returns complete conversation thread, metadata, and ordered messages.
- **Auth**: Bearer token
- **Response**: `200 OK`

### `PATCH /api/conversations/{id}`
Updates conversation status or assignment.
- **Auth**: Bearer token
- **Request Body**:
```json
{
  "status": "resolved",
  "assigned_to": "Sarah Connor"
}
```

### `POST /api/conversations/{id}/messages`
Appends a message to the conversation.
- **Auth**: Bearer token
- **Request Body**:
```json
{
  "role": "operator",
  "content": "Hi there! I am taking over this conversation to assist you directly.",
  "sender_name": "Sarah"
}
```

### `POST /api/conversations/{id}/takeover`
Operator explicitly takes over the conversation from the automated bot.
- **Auth**: Bearer token
- **Effects**: Transitions conversation status to `in_takeover`, sets `assigned_to`, and posts an automated intervention banner in the chat.
- **Response**: `200 OK`

### `POST /api/conversations/{id}/return-to-ai`
Operator returns conversation control back to the AI bot.
- **Auth**: Bearer token
- **Effects**: Resets conversation status to `active`, clears assignment, and posts a handover notice.
- **Response**: `200 OK`

### `POST /api/conversations/{id}/chat`
Internal AI chat endpoint (used by Chat Studio).
- **Auth**: Bearer token
- **Response**: **Server-Sent Events (SSE)** stream:
```
data: {"type": "sources", "sources": [{"source": "Refund_Policy.pdf", "docId": "uuid"}]}
data: {"type": "token", "token": "Refunds"}
data: {"type": "token", "token": " are issued within 5-7 business days."}
data: {"type": "done", "messageId": "msg-uuid"}
```

---

## 5. Public Widget API (No Auth Required)

### `GET /api/public/agents/{id}`
Retrieves public configuration for an agent to render the chat widget.
- **Auth**: None
- **Response**: `200 OK`
```json
{
  "id": "agent-uuid",
  "name": "Acme Support",
  "color": "#0d9488",
  "greetingMessage": "Hi! How can I help you?",
  "suggestedQuestions": ["How do I track my order?", "Contact hours"],
  "leadCaptureEnabled": true,
  "leadCaptureTitle": "Get in touch with our team",
  "hideBranding": false,
  "customBrandName": ""
}
```

### `POST /api/public/conversations/{id}/chat`
Public visitor chat endpoint with SSE streaming, natural language escalation intent detection, and handover safeguards.
- **Auth**: None
- **Request Body**:
```json
{
  "text": "Can I get a refund on my purchase?",
  "role": "user"
}
```
- **Escalation Behavior**: If the visitor says *"speak to a human"* or *"real person"*, the system automatically sets status to `needs_human`, triggers an instant email alert to the agent owner, and returns an escalation notice without charging Gemini token quota.

### `POST /api/public/conversations/{id}/handover`
Triggered when visitor clicks the "Talk to Human" widget button.
- **Auth**: None
- **Effects**: Sets status to `needs_human`, records timestamp, dispatches owner email alert, and pauses the bot.

### `POST /api/public/agents/{id}/leads`
Captures lead form submissions from the public chat widget.
- **Auth**: None
- **Request Body**:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1-555-0192",
  "company": "Acme Corp",
  "message": "Interested in enterprise plan",
  "conversation_id": "optional-conv-uuid"
}
```
- **Response**: `201 Created`

---

## 6. Leads CRM

### `GET /api/leads`
Lists leads captured across all agents.
- **Auth**: Bearer token
- **Query Params**: `status` (`new`, `contacted`, `converted`, `dismissed`), `agent_id`, `search`.

### `PATCH /api/leads/{id}`
Updates lead status or notes.
- **Auth**: Bearer token
- **Request Body**: `{ "status": "contacted" }`

### `POST /api/leads/export`
Exports all leads in standard CSV format for CRM imports.
- **Auth**: Bearer token
- **Response**: `text/csv` attachment.

---

## 7. Multi-Channel Integrations

### `POST /api/integrations/slack/events`
Webhook listener for Slack Events API.
- **Auth**: Validated via Slack `X-Slack-Signature` and HMAC-SHA256 signing secret.
- **Capabilities**: Responds to `url_verification` challenges, processes `app_mention` events, performs Gemini RAG queries, and replies into Slack threads.

### `POST /api/integrations/discord/interactions`
Webhook listener for Discord interactions.
- **Auth**: Validated via Discord Ed25519 signature headers (`X-Signature-Ed25519`, `X-Signature-Timestamp`).
- **Capabilities**: Responds to `PING` (Type 1), parses chat commands, and replies with grounded answers.

---

## 8. Analytics & Dashboard

### `GET /api/dashboard`
Aggregated workspace metrics for the dashboard home:
- `stats`: Active agents, knowledge files indexed, conversations, auto-resolution rate.
- `perAgent`: Breakdown of queries, conversations, messages, and latency per agent.
- `trend7d`: Daily volume breakdown for the trailing 7 days.
- `activity`: Recent operational events feed.

### `GET /api/analytics`
Deep analytics, resolution time percentiles, CSAT satisfaction ratings, sentiment distribution (positive/neutral/negative), and identified knowledge gaps.

---

## 9. Workspace & Security

### `GET /api/settings/status`
Returns connection status for Database and Backblaze B2 storage.

### `DELETE /api/me`
**Permanent Workspace Purge**: Deletes all agents, documents (and associated B2 objects), conversations, messages, and the user row.
- **Auth**: Bearer token
- **Response**: `204 No Content`
