import asyncio
import socket
from collections.abc import AsyncIterator
from contextlib import suppress
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings

# Prefer IPv4 on networks where IPv6 routes are blackholed to avoid connection timeouts
_orig_getaddrinfo = socket.getaddrinfo


def _prefer_ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if family == socket.AF_UNSPEC:
        family = socket.AF_INET
    return _orig_getaddrinfo(host, port, family, type, proto, flags)


socket.getaddrinfo = _prefer_ipv4_getaddrinfo


class Base(DeclarativeBase):
    pass


_settings = get_settings()

engine = None
SessionFactory: async_sessionmaker[AsyncSession] | None = None

if _settings.database_url:
    _url = _settings.database_url
    if _url.startswith("postgres://"):
        _url = _url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif _url.startswith("postgresql://"):
        _url = _url.replace("postgresql://", "postgresql+asyncpg://", 1)

    _parts = urlsplit(_url)
    _query = [(k, v) for k, v in parse_qsl(_parts.query) if k not in ("sslmode", "channel_binding")]
    _needs_ssl = "sslmode=" in _settings.database_url
    _url = urlunsplit((_parts.scheme, _parts.netloc, _parts.path, urlencode(_query), _parts.fragment))

    engine = create_async_engine(
        _url,
        pool_pre_ping=True,
        connect_args={"ssl": True} if _needs_ssl else {},
    )
    SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    if SessionFactory is None:
        raise HTTPException(
            status_code=503,
            detail="Database not configured. Set DATABASE_URL.",
        )
    async with SessionFactory() as session:
        yield session


async def init_db() -> None:
    if engine is None:
        return
    from . import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Guarded alters for columns added after initial deploy (IF NOT EXISTS is idempotent).
        with suppress(Exception):
            await conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_status TEXT DEFAULT 'active'"
            )
        with suppress(Exception):
            await conn.exec_driver_sql("ALTER TABLE messages ADD COLUMN IF NOT EXISTS sources TEXT")
        with suppress(Exception):
            await conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw "
                "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
            )
        with suppress(Exception):
            await conn.exec_driver_sql(
                "ALTER TABLE agents ADD COLUMN IF NOT EXISTS greeting_message TEXT DEFAULT 'Hi! How can I help you today?'"
            )
        with suppress(Exception):
            await conn.exec_driver_sql(
                "ALTER TABLE agents ADD COLUMN IF NOT EXISTS suggested_questions TEXT DEFAULT '[]'"
            )
        with suppress(Exception):
            await conn.exec_driver_sql(
                "ALTER TABLE agents ADD COLUMN IF NOT EXISTS allowed_domains TEXT DEFAULT ''"
            )
        with suppress(Exception):
            await conn.exec_driver_sql(
                "ALTER TABLE agents ADD COLUMN IF NOT EXISTS lead_capture_enabled BOOLEAN DEFAULT FALSE"
            )
        with suppress(Exception):
            await conn.exec_driver_sql(
                "ALTER TABLE agents ADD COLUMN IF NOT EXISTS lead_capture_title TEXT DEFAULT 'Get in touch'"
            )
        with suppress(Exception):
            await conn.exec_driver_sql(
                """
                CREATE TABLE IF NOT EXISTS leads (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
                    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
                    name TEXT,
                    email TEXT NOT NULL,
                    phone TEXT,
                    company TEXT,
                    message TEXT,
                    status TEXT DEFAULT 'new',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_leads_user_id ON leads(user_id)")
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_leads_agent_id ON leads(agent_id)")
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_leads_conversation_id ON leads(conversation_id)")
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_leads_created_at ON leads(created_at)")
        with suppress(Exception):
            await conn.exec_driver_sql(
                """
                CREATE TABLE IF NOT EXISTS integrations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                    platform TEXT NOT NULL,
                    bot_token TEXT,
                    signing_secret TEXT,
                    webhook_url TEXT,
                    channel_id TEXT,
                    status TEXT DEFAULT 'active',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_integrations_user_id ON integrations(user_id)")
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_integrations_agent_id ON integrations(agent_id)")
            await conn.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_integrations_agent_platform ON integrations(agent_id, platform)"
            )
        with suppress(Exception):
            await conn.exec_driver_sql("ALTER TABLE messages ADD COLUMN IF NOT EXISTS rating INTEGER")
            await conn.exec_driver_sql("ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_reason TEXT")
            await conn.exec_driver_sql("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_score INTEGER")
            await conn.exec_driver_sql("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sentiment TEXT DEFAULT 'neutral'")
            await conn.exec_driver_sql(
                """
                CREATE TABLE IF NOT EXISTS knowledge_gaps (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
                    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
                    query TEXT NOT NULL,
                    matched_context TEXT,
                    ai_response_snippet TEXT,
                    reason TEXT DEFAULT 'low_confidence',
                    frequency INTEGER DEFAULT 1,
                    status TEXT DEFAULT 'unresolved',
                    resolution_note TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    last_asked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_user_id ON knowledge_gaps(user_id)")
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_agent_id ON knowledge_gaps(agent_id)")
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_status ON knowledge_gaps(status)")
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_frequency ON knowledge_gaps(frequency DESC)")
            await conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_knowledge_gaps_last_asked ON knowledge_gaps(last_asked_at DESC)")
        with suppress(Exception):
            await conn.exec_driver_sql(
                "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handover_requested_at TIMESTAMPTZ"
            )
            await conn.exec_driver_sql("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_to TEXT")
            await conn.exec_driver_sql("ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT")
            await conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_conversations_status ON conversations(status)"
            )
            await conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_conversations_handover ON conversations(handover_requested_at)"
            )

    await run_migrations()


async def run_migrations() -> None:
    """Stamp the baseline if unversioned, then apply any pending Alembic revisions.

    Existing deployments created their tables via create_all, so on first boot
    after adopting Alembic we stamp `head` instead of replaying the baseline
    DDL (which would collide with the existing tables).
    """
    if engine is None:
        return
    from alembic import command
    from alembic.config import Config
    from sqlalchemy.sql import text

    from . import models  # noqa: F401

    root = Path(__file__).resolve().parent.parent
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))

    async with engine.connect() as conn:
        has_version = await conn.run_sync(lambda c: inspect(c).has_table("alembic_version"))
        versioned = set()
        if has_version:
            rows = (await conn.execute(text("SELECT version_num FROM alembic_version"))).all()
            versioned = {r[0] for r in rows}

    def _sync() -> None:
        if not versioned:
            command.stamp(cfg, "head")
        else:
            command.upgrade(cfg, "head")

    await asyncio.to_thread(_sync)
