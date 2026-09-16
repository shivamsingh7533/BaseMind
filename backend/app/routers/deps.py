import logging
import time

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User

log = logging.getLogger("basemind.api")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_SYNC_BYTES = 2 * 1024 * 1024

CHAT_RATE_WINDOW_SECONDS = 300.0
CHAT_RATE_MAX = 20
_chat_hits: dict[str, list[float]] = {}

# Generic bucketed rate limiter for non-chat endpoints.
_RATE_LIMITS: dict[str, dict[str, list[float]]] = {"chat": {}}
_chat_hits = _RATE_LIMITS["chat"]
UPLOAD_RATE_MAX = 10
UPLOAD_RATE_WINDOW = 60.0
SYNC_RATE_MAX = 10
SYNC_RATE_WINDOW = 60.0
AGENT_CREATE_RATE_MAX = 10
AGENT_CREATE_WINDOW = 60.0
OPS_RATE_MAX = 20
OPS_RATE_WINDOW = 60.0


def _allow_rate_limited(bucket: str, user_id: str, max_hits: int, window: float) -> bool:
    now = time.time()
    bucket_store = _RATE_LIMITS.setdefault(bucket, {})
    hits = [t for t in bucket_store.get(user_id, []) if now - t < window]
    if len(hits) >= max_hits:
        bucket_store[user_id] = hits
        return False
    hits.append(now)
    bucket_store[user_id] = hits
    return True


def _allow_chat(user_id: str) -> bool:
    return _allow_rate_limited("chat", user_id, CHAT_RATE_MAX, CHAT_RATE_WINDOW_SECONDS)


async def _get_owned(db: AsyncSession, model, obj_id: str, user: User):
    result = await db.execute(select(model).where(model.id == obj_id, model.user_id == user.id))
    obj = result.scalar_one_or_none()
    if obj is None:
        exists = await db.execute(select(model.id).where(model.id == obj_id))
        if exists.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"{model.__name__} belongs to a different account (you may have signed in with another method)"
                ),
            )
        raise HTTPException(
            status_code=404,
            detail=f"{model.__name__} not found — it may already be deleted",
        )
    return obj
