import contextlib
import json
import time

from .config import get_settings

_client = None
_initialized = False
_mem_cache: dict[str, tuple[float, any]] = {}


def _get_redis():
    global _client, _initialized
    if not _initialized:
        _initialized = True
        settings = get_settings()
        if settings.upstash_redis_rest_url and settings.upstash_redis_rest_token:
            from upstash_redis.asyncio import Redis

            _client = Redis(
                url=settings.upstash_redis_rest_url,
                token=settings.upstash_redis_rest_token,
            )
    return _client


async def cache_get(key: str):
    redis = _get_redis()
    if redis is not None:
        try:
            value = await redis.get(key)
            if value is not None:
                if isinstance(value, (str, bytes)):
                    return json.loads(value)
                return value
        except Exception:
            pass

    # In-memory fallback
    now = time.time()
    if key in _mem_cache:
        exp, val = _mem_cache[key]
        if now < exp:
            return val
        del _mem_cache[key]
    return None


async def cache_set(key: str, value, ttl_seconds: int = 60) -> None:
    redis = _get_redis()
    if redis is not None:
        with contextlib.suppress(Exception):
            await redis.set(key, json.dumps(value), ex=ttl_seconds)

    # In-memory fallback
    now = time.time()
    _mem_cache[key] = (now + ttl_seconds, value)


async def invalidate_user_cache(user_id: str) -> None:
    redis = _get_redis()
    if redis is not None:
        try:
            keys = [
                f"dash:{user_id}",
                f"agents:{user_id}",
                f"docs:{user_id}",
                f"convs:{user_id}",
            ]
            for key in keys:
                await redis.delete(key)
        except Exception:
            pass

    # In-memory purge
    for k in list(_mem_cache.keys()):
        if str(user_id) in k:
            _mem_cache.pop(k, None)
