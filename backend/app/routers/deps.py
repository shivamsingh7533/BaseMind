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


def _allow_chat(user_id: str) -> bool:
    now = time.time()
    hits = [t for t in _chat_hits.get(user_id, []) if now - t < CHAT_RATE_WINDOW_SECONDS]
    if len(hits) >= CHAT_RATE_MAX:
        _chat_hits[user_id] = hits
        return False
    hits.append(now)
    _chat_hits[user_id] = hits
    return True


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
