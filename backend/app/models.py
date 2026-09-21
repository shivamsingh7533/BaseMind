import uuid
from datetime import UTC, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

EMBEDDING_DIM = 768


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    clerk_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    platform_status: Mapped[str | None] = mapped_column(Text, default="active", nullable=True, server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    agents: Mapped[list["Agent"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    leads: Mapped[list["Lead"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    integrations: Mapped[list["Integration"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    knowledge_gaps: Mapped[list["KnowledgeGap"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    actions: Mapped[list["AgentAction"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    api_keys: Mapped[list["UserApiKey"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[str | None] = mapped_column(Text, default="", nullable=True, server_default="")
    color: Mapped[str | None] = mapped_column(Text, default="#0d9488", nullable=True, server_default="#0d9488")
    status: Mapped[str] = mapped_column(Text, default="paused")
    train_progress: Mapped[int | None] = mapped_column(Integer, nullable=True)
    queries_24h: Mapped[int] = mapped_column(Integer, default=0)
    avg_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    greeting_message: Mapped[str | None] = mapped_column(
        Text, default="Hi! How can I help you today?", nullable=True, server_default="Hi! How can I help you today?"
    )
    suggested_questions: Mapped[str | None] = mapped_column(
        Text, default="[]", nullable=True, server_default="[]"
    )
    allowed_domains: Mapped[str | None] = mapped_column(
        Text, default="", nullable=True, server_default=""
    )
    lead_capture_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    lead_capture_title: Mapped[str | None] = mapped_column(
        Text, default="Get in touch", nullable=True, server_default="Get in touch"
    )
    hide_branding: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    custom_brand_name: Mapped[str | None] = mapped_column(
        Text, default="", nullable=True, server_default=""
    )
    model_provider: Mapped[str] = mapped_column(Text, default="gemini", server_default="gemini")
    model_name: Mapped[str] = mapped_column(Text, default="gemini-2.5-flash", server_default="gemini-2.5-flash")
    fallback_model: Mapped[str] = mapped_column(Text, default="gemini-2.5-flash", server_default="gemini-2.5-flash")
    temperature: Mapped[float] = mapped_column(Float, default=0.2, server_default="0.2")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    owner: Mapped["User"] = relationship(back_populates="agents")
    documents: Mapped[list["Document"]] = relationship(back_populates="agent", cascade="all, delete-orphan")
    leads: Mapped[list["Lead"]] = relationship(back_populates="agent")
    integrations: Mapped[list["Integration"]] = relationship(back_populates="agent", cascade="all, delete-orphan")
    knowledge_gaps: Mapped[list["KnowledgeGap"]] = relationship(back_populates="agent")
    actions: Mapped[list["AgentAction"]] = relationship(back_populates="agent", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, default="PDF")
    detail: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(Text, default="processing")
    storage_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    agent: Mapped[Agent | None] = relationship(back_populates="documents")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    visitor: Mapped[str] = mapped_column(Text, default="Guest")
    status: Mapped[str] = mapped_column(Text, default="active")
    preview: Mapped[str] = mapped_column(Text, default="")
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    sentiment: Mapped[str | None] = mapped_column(Text, default="neutral")
    csat_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    handover_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    sender_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    plan: Mapped[str] = mapped_column(Text, default="free")
    status: Mapped[str] = mapped_column(Text, default="active")
    stripe_customer_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    razorpay_subscription_id: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    razorpay_customer_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    razorpay_plan_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class EventLog(Base):
    __tablename__ = "event_logs"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    severity: Mapped[str] = mapped_column(Text, default="info")
    detail: Mapped[str] = mapped_column(Text, default="")
    ref_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(Text, default="info")
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    announcement_id: Mapped[str] = mapped_column(
        ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), nullable=True, index=True)
    conversation_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    company: Mapped[str | None] = mapped_column(Text, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="new", server_default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    user: Mapped["User"] = relationship(back_populates="leads")
    agent: Mapped[Agent | None] = relationship(back_populates="leads")
    conversation: Mapped[Conversation | None] = relationship()


class Integration(Base):
    __tablename__ = "integrations"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(Text, nullable=False)
    bot_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    signing_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    channel_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    user: Mapped["User"] = relationship(back_populates="integrations")
    agent: Mapped["Agent"] = relationship(back_populates="integrations")


class KnowledgeGap(Base):
    __tablename__ = "knowledge_gaps"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), nullable=True, index=True)
    conversation_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    query: Mapped[str] = mapped_column(Text, nullable=False)
    matched_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_response_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str] = mapped_column(Text, default="low_confidence", server_default="low_confidence")
    frequency: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    status: Mapped[str] = mapped_column(Text, default="unresolved", server_default="unresolved", index=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_asked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    user: Mapped["User"] = relationship(back_populates="knowledge_gaps")
    agent: Mapped[Agent | None] = relationship(back_populates="knowledge_gaps")
    conversation: Mapped[Conversation | None] = relationship()


class AgentAction(Base):
    __tablename__ = "agent_actions"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    webhook_url: Mapped[str] = mapped_column(Text, nullable=False)
    method: Mapped[str] = mapped_column(Text, default="POST", server_default="POST")
    headers_json: Mapped[str | None] = mapped_column(Text, default="{}", server_default="{}")
    parameters_schema_json: Mapped[str | None] = mapped_column(Text, default="[]", server_default="[]")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    user: Mapped["User"] = relationship(back_populates="actions")
    agent: Mapped["Agent"] = relationship(back_populates="actions")


class UserApiKey(Base):
    __tablename__ = "user_api_keys"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    key_hash_suffix: Mapped[str] = mapped_column(Text, nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    user: Mapped["User"] = relationship(back_populates="api_keys")




