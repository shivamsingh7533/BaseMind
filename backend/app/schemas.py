import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


def _fmt_time(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.strftime("%I:%M %p").lstrip("0")


def _fmt_duration(seconds: int) -> str:
    if seconds <= 0:
        return "0m"
    return f"{seconds // 60}m"


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(default="", max_length=2048)
    instructions: str = Field(default="", max_length=8000)
    color: str = Field(default="#0d9488", pattern=r"^#[0-9a-fA-F]{6}$")
    greeting_message: str | None = Field(default="Hi! How can I help you today?", max_length=500)
    suggested_questions: list[str] | None = Field(default_factory=list)
    allowed_domains: str | None = Field(default="", max_length=1000)


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    url: str | None = Field(default=None, max_length=2048)
    instructions: str | None = Field(default=None, max_length=8000)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    status: Literal["active", "paused", "training"] | None = None
    greeting_message: str | None = Field(default=None, max_length=500)
    suggested_questions: list[str] | None = None
    allowed_domains: str | None = Field(default=None, max_length=1000)


class DocumentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(default="PDF", max_length=20)
    detail: str = Field(default="", max_length=200)
    agent_id: str | None = None


class SyncUrlRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    agent_id: str | None = None


class MessageIn(BaseModel):
    role: Literal["user", "agent"]
    text: str = Field(min_length=1, max_length=8000)


class ConversationCreate(BaseModel):
    visitor: str = Field(default="Guest", max_length=120)
    agent_id: str | None = None


class ConversationUpdate(BaseModel):
    status: Literal["active", "resolved", "halted"] | None = None
    duration_seconds: int | None = Field(default=None, ge=0)


class OperatorAlert(BaseModel):
    subject: str = Field(default="Operator Alert", max_length=200)
    html: str = Field(default="", max_length=20000)


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    severity: Literal["info", "attention", "error"] = "info"


def serialize_agent(agent, usage: dict | None = None) -> dict:
    usage = usage or {}
    raw_sq = getattr(agent, "suggested_questions", "[]") or "[]"
    if isinstance(raw_sq, str):
        try:
            suggested_questions = json.loads(raw_sq)
        except Exception:
            suggested_questions = []
    elif isinstance(raw_sq, list):
        suggested_questions = raw_sq
    else:
        suggested_questions = []

    return {
        "id": agent.id,
        "name": agent.name,
        "url": agent.url,
        "instructions": getattr(agent, "instructions", "") or "",
        "color": getattr(agent, "color", "") or "#0d9488",
        "status": agent.status,
        "greetingMessage": getattr(agent, "greeting_message", "") or "Hi! How can I help you today?",
        "suggestedQuestions": suggested_questions,
        "allowedDomains": getattr(agent, "allowed_domains", "") or "",
        "queries24h": usage.get("queries24h", agent.queries_24h),
        "avgLatencyMs": usage.get("avgLatencyMs", agent.avg_latency_ms),
        "trainProgress": agent.train_progress,
    }


def serialize_document(doc) -> dict:
    return {
        "id": doc.id,
        "name": doc.name,
        "type": doc.type,
        "detail": doc.detail,
        "status": doc.status,
        "storageKey": doc.storage_key,
    }


def serialize_message(message) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "text": message.content,
        "time": _fmt_time(message.created_at),
    }


def serialize_conversation(conv, with_messages: bool = False) -> dict:
    data = {
        "id": conv.id,
        "user": conv.visitor,
        "status": conv.status,
        "time": _fmt_time(conv.started_at),
        "preview": conv.preview,
        "messageCount": len(conv.messages),
        "duration": _fmt_duration(conv.duration_seconds),
        "startedAt": conv.started_at.isoformat() if conv.started_at else "",
    }
    if with_messages:
        data["messages"] = [serialize_message(m) for m in conv.messages]
    return data
