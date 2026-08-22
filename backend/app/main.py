from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .data import AGENTS, CONVERSATIONS, DASHBOARD, DOCUMENTS

import os

app = FastAPI(
    title="BaseMind API",
    version="0.1.0",
    description="Backend for the BaseMind AI SaaS platform demo.",
)

_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_extra = os.environ.get("ALLOWED_ORIGINS", "")
if _extra:
    _origins.extend(o.strip() for o in _extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "basemind-api"}


@app.get("/api/dashboard")
def dashboard() -> dict:
    return DASHBOARD


@app.get("/api/agents")
def agents() -> list[dict]:
    return AGENTS


@app.get("/api/agents/{agent_id}")
def agent_detail(agent_id: str) -> dict:
    for agent in AGENTS:
        if agent["id"] == agent_id:
            return agent
    return {"error": "agent not found", "id": agent_id}


@app.get("/api/documents")
def documents() -> list[dict]:
    return DOCUMENTS


@app.get("/api/conversations")
def conversations() -> list[dict]:
    return CONVERSATIONS


@app.get("/api/conversations/{conversation_id}")
def conversation_detail(conversation_id: str) -> dict:
    for conversation in CONVERSATIONS:
        if conversation["id"] == conversation_id:
            return conversation
    return {"error": "conversation not found", "id": conversation_id}
