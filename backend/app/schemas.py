import json
from datetime import datetime
from typing import Any, Literal

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
    lead_capture_enabled: bool | None = False
    lead_capture_title: str | None = Field(default="Get in touch", max_length=200)
    hide_branding: bool | None = False
    custom_brand_name: str | None = Field(default="", max_length=120)
    model_provider: str | None = Field(default="gemini", max_length=50)
    model_name: str | None = Field(default="gemini-2.5-flash", max_length=100)
    fallback_model: str | None = Field(default="gemini-2.5-flash", max_length=100)
    temperature: float | None = Field(default=0.2, ge=0.0, le=1.0)


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    url: str | None = Field(default=None, max_length=2048)
    instructions: str | None = Field(default=None, max_length=8000)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    status: Literal["active", "paused", "training"] | None = None
    greeting_message: str | None = Field(default=None, max_length=500)
    suggested_questions: list[str] | None = None
    allowed_domains: str | None = Field(default=None, max_length=1000)
    lead_capture_enabled: bool | None = None
    lead_capture_title: str | None = Field(default=None, max_length=200)
    hide_branding: bool | None = None
    custom_brand_name: str | None = Field(default=None, max_length=120)
    model_provider: str | None = Field(default=None, max_length=50)
    model_name: str | None = Field(default=None, max_length=100)
    fallback_model: str | None = Field(default=None, max_length=100)
    temperature: float | None = Field(default=None, ge=0.0, le=1.0)


class LeadCreate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=120)
    message: str | None = Field(default=None, max_length=2000)
    conversation_id: str | None = None


class LeadUpdate(BaseModel):
    status: Literal["new", "contacted", "qualified", "closed"] | None = None
    name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=120)
    message: str | None = Field(default=None, max_length=2000)


class IntegrationCreate(BaseModel):
    platform: Literal["slack", "discord", "whatsapp", "telegram"]
    bot_token: str | None = Field(default=None, max_length=1000)
    signing_secret: str | None = Field(default=None, max_length=1000)
    webhook_url: str | None = Field(default=None, max_length=2048)
    channel_id: str | None = Field(default=None, max_length=255)


class IntegrationUpdate(BaseModel):
    bot_token: str | None = Field(default=None, max_length=1000)
    signing_secret: str | None = Field(default=None, max_length=1000)
    webhook_url: str | None = Field(default=None, max_length=2048)
    channel_id: str | None = Field(default=None, max_length=255)
    status: Literal["active", "inactive"] | None = None


class DocumentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(default="PDF", max_length=20)
    detail: str = Field(default="", max_length=200)
    agent_id: str | None = None


class SyncUrlRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    agent_id: str | None = None
    crawl_depth: int | None = Field(default=1, ge=1, le=3)
    sync_schedule: Literal["manual", "daily", "weekly"] | None = "manual"


class MessageIn(BaseModel):
    role: Literal["user", "agent", "operator"]
    text: str = Field(min_length=1, max_length=8000)
    sender_name: str | None = Field(default=None, max_length=120)
    image_base64: str | None = Field(default=None, max_length=5_000_000)
    image_mime_type: str | None = Field(default="image/png", max_length=50)


class ConversationCreate(BaseModel):
    visitor: str = Field(default="Guest", max_length=120)
    agent_id: str | None = None


class ConversationUpdate(BaseModel):
    status: Literal["active", "resolved", "halted", "needs_human", "in_takeover"] | None = None
    duration_seconds: int | None = Field(default=None, ge=0)
    sentiment: Literal["positive", "neutral", "negative"] | None = None
    csat_score: int | None = Field(default=None, ge=1, le=5)
    assigned_to: str | None = Field(default=None, max_length=200)


class MessageFeedbackIn(BaseModel):
    rating: Literal[1, -1]
    reason: str | None = Field(default=None, max_length=120)
    comment: str | None = Field(default=None, max_length=1000)


class KnowledgeGapUpdate(BaseModel):
    status: Literal["unresolved", "resolved", "dismissed", "ignored"] | None = None
    resolution_note: str | None = Field(default=None, max_length=2000)


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
        "leadCaptureEnabled": bool(getattr(agent, "lead_capture_enabled", False)),
        "leadCaptureTitle": getattr(agent, "lead_capture_title", "") or "Get in touch",
        "hideBranding": bool(getattr(agent, "hide_branding", False)),
        "customBrandName": getattr(agent, "custom_brand_name", "") or "",
        "modelProvider": getattr(agent, "model_provider", "gemini") or "gemini",
        "modelName": getattr(agent, "model_name", "gemini-2.5-flash") or "gemini-2.5-flash",
        "fallbackModel": getattr(agent, "fallback_model", "gemini-2.5-flash") or "gemini-2.5-flash",
        "temperature": getattr(agent, "temperature", 0.2) or 0.2,
        "queries24h": usage.get("queries24h", agent.queries_24h),
        "avgLatencyMs": usage.get("avgLatencyMs", agent.avg_latency_ms),
        "trainProgress": agent.train_progress,
    }


def serialize_lead(lead, agent_name: str | None = None) -> dict:
    return {
        "id": lead.id,
        "userId": lead.user_id,
        "agentId": lead.agent_id,
        "agentName": agent_name or (lead.agent.name if getattr(lead, "agent", None) else None),
        "conversationId": lead.conversation_id,
        "name": lead.name or "",
        "email": lead.email,
        "phone": lead.phone or "",
        "company": lead.company or "",
        "message": lead.message or "",
        "status": lead.status or "new",
        "createdAt": lead.created_at.isoformat() if getattr(lead, "created_at", None) else "",
    }


def serialize_integration(integ) -> dict:
    def _mask(s: str | None) -> str:
        if not s:
            return ""
        if len(s) <= 8:
            return "••••••••"
        return s[:4] + "••••••••" + s[-4:]

    return {
        "id": integ.id,
        "agentId": integ.agent_id,
        "platform": integ.platform,
        "botTokenMasked": _mask(integ.bot_token),
        "signingSecretMasked": _mask(integ.signing_secret),
        "hasBotToken": bool(integ.bot_token),
        "hasSigningSecret": bool(integ.signing_secret),
        "webhookUrl": integ.webhook_url or "",
        "channelId": integ.channel_id or "",
        "status": integ.status,
        "createdAt": integ.created_at.isoformat() if getattr(integ, "created_at", None) else "",
        "updatedAt": integ.updated_at.isoformat() if getattr(integ, "updated_at", None) else "",
    }


def serialize_document(doc) -> dict:
    return {
        "id": doc.id,
        "name": doc.name,
        "type": doc.type,
        "detail": doc.detail,
        "status": doc.status,
        "storageKey": doc.storage_key,
        "syncSchedule": getattr(doc, "sync_schedule", "manual") or "manual",
        "lastSyncedAt": doc.last_synced_at.isoformat() if getattr(doc, "last_synced_at", None) else None,
        "crawlDepth": getattr(doc, "crawl_depth", 1) or 1,
    }


def serialize_message(message) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "text": message.content,
        "time": _fmt_time(message.created_at),
        "rating": getattr(message, "rating", None),
        "feedbackReason": getattr(message, "feedback_reason", None),
        "senderName": getattr(message, "sender_name", None),
        "imageUrl": getattr(message, "image_url", None),
    }


def serialize_conversation(conv, with_messages: bool = False) -> dict:
    msgs = conv.messages if "messages" in conv.__dict__ and conv.messages is not None else []
    data = {
        "id": conv.id,
        "user": conv.visitor,
        "status": conv.status,
        "channel": getattr(conv, "channel", "web") or "web",
        "externalChatId": getattr(conv, "external_chat_id", None),
        "sentiment": getattr(conv, "sentiment", "neutral") or "neutral",
        "csatScore": getattr(conv, "csat_score", None),
        "time": _fmt_time(conv.started_at),
        "preview": conv.preview,
        "messageCount": len(msgs),
        "duration": _fmt_duration(conv.duration_seconds),
        "startedAt": conv.started_at.isoformat() if conv.started_at else "",
        "handoverRequestedAt": conv.handover_requested_at.isoformat() if getattr(conv, "handover_requested_at", None) else None,
        "assignedTo": getattr(conv, "assigned_to", None),
    }
    if with_messages:
        data["messages"] = [serialize_message(m) for m in msgs]
    return data


def serialize_knowledge_gap(gap, agent_name: str | None = None) -> dict:
    return {
        "id": gap.id,
        "userId": gap.user_id,
        "agentId": gap.agent_id,
        "agentName": agent_name or (gap.agent.name if getattr(gap, "agent", None) else None),
        "conversationId": gap.conversation_id,
        "query": gap.query,
        "matchedContext": gap.matched_context or "",
        "aiResponseSnippet": gap.ai_response_snippet or "",
        "reason": gap.reason or "low_confidence",
        "frequency": gap.frequency or 1,
        "status": gap.status or "unresolved",
        "resolutionNote": gap.resolution_note or "",
        "createdAt": gap.created_at.isoformat() if getattr(gap, "created_at", None) else "",
        "lastAskedAt": gap.last_asked_at.isoformat() if getattr(gap, "last_asked_at", None) else "",
    }


class ActionParameter(BaseModel):
    name: str
    type: Literal["string", "number", "integer", "boolean"] = "string"
    description: str = ""
    required: bool = True


class AgentActionCreate(BaseModel):
    agent_id: str
    name: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    description: str = Field(min_length=1, max_length=1000)
    webhook_url: str = Field(min_length=1, max_length=2048)
    method: Literal["GET", "POST", "PUT", "DELETE"] = "POST"
    headers_json: str | None = "{}"
    parameters_schema_json: str | None = "[]"
    enabled: bool = True


class AgentActionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    description: str | None = Field(default=None, min_length=1, max_length=1000)
    webhook_url: str | None = Field(default=None, min_length=1, max_length=2048)
    method: Literal["GET", "POST", "PUT", "DELETE"] | None = None
    headers_json: str | None = None
    parameters_schema_json: str | None = None
    enabled: bool | None = None


class AgentActionTest(BaseModel):
    parameters: dict[str, Any] = Field(default_factory=dict)


class CoPilotSuggestRequest(BaseModel):
    tone: Literal["friendly", "concise", "formal"] = "friendly"


class CoPilotSummaryResponse(BaseModel):
    summary: str
    sentiment: str = "neutral"
    key_details: list[str] = Field(default_factory=list)


class CoPilotSuggestResponse(BaseModel):
    suggestions: list[str]


class UserApiKeyCreate(BaseModel):
    provider: Literal["openai", "anthropic", "gemini", "custom"]
    api_key: str = Field(min_length=3, max_length=500)
    base_url: str | None = Field(default=None, max_length=500)


def serialize_user_api_key(key) -> dict:
    return {
        "id": key.id,
        "provider": key.provider,
        "keyHashSuffix": key.key_hash_suffix,
        "baseUrl": key.base_url,
        "isValid": key.is_valid,
        "createdAt": key.created_at.isoformat() if getattr(key, "created_at", None) else "",
        "updatedAt": key.updated_at.isoformat() if getattr(key, "updated_at", None) else "",
    }


def serialize_agent_action(action) -> dict:
    return {
        "id": action.id,
        "userId": action.user_id,
        "agentId": action.agent_id,
        "name": action.name,
        "description": action.description,
        "webhookUrl": action.webhook_url,
        "method": action.method,
        "headersJson": action.headers_json or "{}",
        "parametersSchemaJson": action.parameters_schema_json or "[]",
        "enabled": action.enabled,
        "createdAt": action.created_at.isoformat() if getattr(action, "created_at", None) else "",
        "updatedAt": action.updated_at.isoformat() if getattr(action, "updated_at", None) else "",
    }
