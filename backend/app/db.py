from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings


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
    _query = [(k, v) for k, v in parse_qsl(_parts.query) if k != "sslmode"]
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
