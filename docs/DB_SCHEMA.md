# DB Schema (Neon Postgres + pgvector)

Extension: `CREATE EXTENSION IF NOT EXISTS vector;`

## users
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| clerk_id | text unique | Clerk `sub` claim |
| email | text nullable | backfilled from claims when empty |
| name | text nullable | name or username claim |
| created_at | timestamptz | |

## agents
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | ownership scope |
| name | text | |
| url | text default '' | site to link agent to |
| instructions | text default '' | injected into RAG system prompt |
| color | text default '#0d9488' | brand color for Studio UI |
| status | text | active / training / paused |
| created_at | timestamptz | |

## documents
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| name | text | filename |
| type | text | pdf/txt/csv/md/url |
| detail | text | e.g. "indexed, 12 chunks" |
| status | text | ready / processing / failed |
| created_at | timestamptz | |

## document_chunks
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| document_id | uuid FK → documents | cascade delete |
| chunk_index | int | order within doc |
| content | text | raw chunk text |
| embedding | Vector(768) | pgvector column, Gemini embeddings |

## conversations
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | owner (agent creator) |
| visitor | text | display name of tester/visitor |
| status | text | active / resolved / halted |
| created_at | timestamptz | |

## messages
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid FK → conversations | cascade delete |
| role | text | user / assistant |
| text | text | |
| created_at | timestamptz | |

Notes: embeddings use cosine distance; every user-facing query filters by `user_id` through `_get_owned`.
