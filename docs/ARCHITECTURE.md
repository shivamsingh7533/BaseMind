# BaseMind System Architecture

BaseMind is designed as an enterprise-grade, multi-tenant AI Customer Support platform. It combines retrieval-augmented generation (RAG), live human operator takeover, multi-channel messaging bots, and automated lead capture into a unified architecture.

---

## High-Level Topology

```
                  ┌────────────────────────────────────────────────────────┐
                  │                        Clients                         │
                  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
                  │  │ Web Browser  │  │ Slack App    │  │ Discord Bot  │  │
                  │  │ (Next.js 16) │  │ (Events API) │  │ (Interactions│  │
                  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
                  └─────────┼─────────────────┼─────────────────┼──────────┘
                            │                 │                 │
                            ▼                 ▼                 ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                   FastAPI Gateway (Render Production)                  │
  │                                                                        │
  │  ┌────────────────┐   ┌─────────────────┐   ┌───────────────────────┐  │
  │  │  auth.py       │   │  routers/       │   │  ai.py                │  │
  │  │  Clerk JWKS    │   │  • agents       │   │  • Gemini Embeddings  │  │
  │  │  Leeway skew   │   │  • documents    │   │  • pgvector Cosine Sim│  │
  │  │  User Upsert   │   │  • conversations│   │  • 2.5-Flash Streaming│  │
  │  └────────────────┘   │  • public widget│   └───────────────────────┘  │
  │                       │  • integrations │                              │
  │  ┌────────────────┐   │  • leads        │   ┌───────────────────────┐  │
  │  │  email.py      │   │  • admin / ops  │   │  storage.py           │  │
  │  │  Async Alerts  │   └─────────────────┘   │  • Backblaze B2 S3    │  │
  │  │  Rate Cooldown │                         │  • Signed Download URL│  │
  │  └────────────────┘                         └───────────────────────┘  │
  └───────────────────────────────┬────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  Neon PostgreSQL  │   │   Backblaze B2    │   │  Google Gemini    │
│  • pgvector (768) │   │  • Encrypted S3   │   │  • text-embedding │
│  • Tenant scoped  │   │  • Original docs  │   │  • gemini-2.5-flash│
└───────────────────┘   └───────────────────┘   └───────────────────┘
```

---

## 1. Document Ingestion & RAG Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User as Operator / Admin
    participant Client as Next.js Dashboard
    participant API as FastAPI Ingestion
    participant B2 as Backblaze B2
    participant Gemini as Google AI Studio
    participant DB as Neon (pgvector)

    User->>Client: Upload PDF/TXT/CSV/MD or enter Web URL
    Client->>API: POST /api/documents/upload (Multipart) or /sync (URL)
    API->>B2: Upload raw file to private bucket
    B2-->>API: Returns storage_key
    API->>API: Extract readable text & split chunks (1200 chars, 150 overlap)
    API->>Gemini: Batch embed chunks via gemini-embedding-001 (768 dims)
    Gemini-->>API: Return embedding vectors
    API->>DB: Insert document record + document_chunks with Vector(768)
    API-->>Client: 201 Created ("indexed, N chunks")
```

### Knowledge Base Ingestion Details:
- **Chunking Strategy**: 1,200 characters per chunk with a 150-character sliding window overlap to prevent context fragmentation across sentences.
- **Vector Dimension**: 768-dimensional float vectors indexed using PostgreSQL `vector` extension.
- **Fail-safe Storage**: If Backblaze B2 is temporarily unreachable or disabled, vector indexing still succeeds, while file storage gracefully logs a warning.

---

## 2. Real-Time Chat & Retrieval Flow

```mermaid
sequenceDiagram
    autonumber
    actor Visitor as Customer / Visitor
    participant Widget as BaseMind Widget
    participant API as FastAPI Chat Router
    participant DB as Neon pgvector
    participant Gemini as Gemini 2.5 Flash

    Visitor->>Widget: Asks question ("What is your refund policy?")
    Widget->>API: POST /api/public/conversations/{id}/chat (SSE)
    API->>Gemini: Embed question (768-dim)
    Gemini-->>API: Query vector
    API->>DB: Cosine similarity search (<=>) on agent's chunks (top_k=4)
    DB-->>API: Ranked relevant chunks
    API->>Widget: SSE event: {"type": "sources", "sources": [...]}
    API->>Gemini: Stream prompt [Agent System Instructions + Sources + User Query]
    loop Token Streaming
        Gemini-->>API: Token chunks
        API->>Widget: SSE event: {"type": "token", "token": "..."}
    end
    API->>DB: Persist user & assistant message turns
    API->>Widget: SSE event: {"type": "done"}
```

---

## 3. Human-in-the-Loop Takeover & Handover Queue

BaseMind guarantees that automated AI responses never interfere once a human operator intervenes.

```mermaid
stateDiagram-v2
    [*] --> active : Conversation Started
    active --> needs_human : Visitor clicks "Talk to Human" OR asks for agent
    active --> resolved : Resolved by AI
    active --> halted : Paused by user

    state needs_human {
        [*] --> BotPaused : Generation Stopped
        BotPaused --> AlertOwner : Dispatch Email Alert
    }

    needs_human --> in_takeover : Operator clicks "Take Over Now"
    
    state in_takeover {
        [*] --> OperatorChat : Direct human replies
        OperatorChat --> RealtimeSync : Polling sync to visitor widget
    }

    in_takeover --> active : Operator clicks "Return to AI"
    in_takeover --> resolved : Operator marks Resolved
    resolved --> active : Visitor sends new message
```

### Handover Enforcement:
1. **Queue Isolation**: In `needs_human` or `in_takeover` states, the public chat endpoint bypasses Gemini RAG entirely. Visitor messages are appended to the database and returned without incurring AI token latency or costs.
2. **Real-Time Polling**: The visitor widget polls `GET /api/public/conversations/{id}` every 3 seconds while in handover, instantly reflecting human operator responses.
3. **Operator Mode**: Operator messages carry `role="operator"` and the operator's display name, rendering distinctive badges in both the studio and visitor widget.

---

## 4. Multi-Channel Messaging Bots (Slack & Discord)

### Slack Events Architecture:
- Incoming HTTP `POST` to `/api/integrations/slack/events`.
- Validates `X-Slack-Signature` using workspace `signing_secret` and HMAC-SHA256.
- Handles `url_verification` challenges automatically.
- Subscribes to `app_mention` and direct messages.
- Invokes Gemini RAG with the agent's knowledge base and replies directly to the Slack message thread.

### Discord Interactions Architecture:
- Incoming HTTP `POST` to `/api/integrations/discord/interactions`.
- Validates cryptographic Ed25519 signatures (`X-Signature-Ed25519`, `X-Signature-Timestamp`).
- Responds to Discord `PING` (Type 1) challenges with `PONG`.
- Executes slash commands and chat questions with citations.

---

## 5. Security & Multi-Tenant Isolation

1. **Authentication (Clerk)**:
   - Client acquires session JWT from Clerk.
   - Backend decodes and verifies JWT against Clerk's JWKS endpoint.
   - Includes a 60-second clock skew tolerance (`leeway=60`) to absorb timestamp drifts between Vercel, Clerk, and Render.
   - Normalizes issuer URL with and without trailing slashes.
2. **Row-Level Tenant Isolation**:
   - Every database query for private resources filters by `user_id == current_user.id`.
   - Foreign keys enforce `ON DELETE CASCADE` so deleting a workspace (`DELETE /api/me`) completely erases all tenant data and files.
3. **White-Label & Domain Sandboxing**:
   - Agents can define `allowed_domains` to restrict iframe embedding and widget initialization.
