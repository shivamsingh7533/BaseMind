from .config import get_settings

_client = None
_initialized = False


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
    if redis is None:
        return None
    try:
        return await redis.get(key)
    except Exception:
        return None


async def cache_set(key: str, value, ttl_seconds: int = 120) -> None:
    redis = _get_redis()
    if redis is None:
        return
    try:
        await redis.set(key, value, ex=ttl_seconds)
    except Exception:
        pass


async def invalidate_user_cache(user_id: str) -> None:
    redis = _get_redis()
    if redis is None:
        return
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
