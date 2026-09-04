"""Redis client with graceful fallback to in-memory when Redis is unavailable."""
import os
import json
import logging
from typing import Optional, Any

logger = logging.getLogger("backend.redis")

REDIS_URL = os.getenv("REDIS_URL", "")

_redis: Optional[Any] = None


async def get_redis() -> Optional[Any]:
    global _redis
    if not REDIS_URL:
        return None
    if _redis is None:
        try:
            import aioredis
            _redis = await aioredis.from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=3,
            )
            # Verify connection
            await _redis.ping()
        except Exception as e:
            logger.warning("Redis unavailable (%s) — using in-memory fallback", e)
            _redis = None
            return None
    return _redis


async def redis_sadd(key: str, *values: str) -> bool:
    r = await get_redis()
    if r is None:
        return False
    try:
        await r.sadd(key, *values)
        return True
    except Exception as e:
        logger.debug("redis_sadd error: %s", e)
        return False


async def redis_sismember(key: str, value: str) -> bool:
    r = await get_redis()
    if r is None:
        return False
    try:
        return bool(await r.sismember(key, value))
    except Exception:
        return False


async def redis_srem(key: str, *values: str) -> bool:
    r = await get_redis()
    if r is None:
        return False
    try:
        await r.srem(key, *values)
        return True
    except Exception:
        return False


async def redis_smembers(key: str) -> set:
    r = await get_redis()
    if r is None:
        return set()
    try:
        return await r.smembers(key)
    except Exception:
        return set()


async def redis_set(key: str, value: str, ex: Optional[int] = None) -> bool:
    r = await get_redis()
    if r is None:
        return False
    try:
        await r.set(key, value, ex=ex)
        return True
    except Exception:
        return False


async def redis_get(key: str) -> Optional[str]:
    r = await get_redis()
    if r is None:
        return None
    try:
        return await r.get(key)
    except Exception:
        return None


async def redis_incr(key: str, ex: Optional[int] = None) -> Optional[int]:
    """Increment counter. Sets expiry on first increment."""
    r = await get_redis()
    if r is None:
        return None
    try:
        val = await r.incr(key)
        if ex is not None and val == 1:
            await r.expire(key, ex)
        return val
    except Exception:
        return None


async def redis_delete(key: str) -> bool:
    r = await get_redis()
    if r is None:
        return False
    try:
        await r.delete(key)
        return True
    except Exception:
        return False


async def redis_publish(channel: str, message: Any) -> bool:
    r = await get_redis()
    if r is None:
        return False
    try:
        msg = json.dumps(message, ensure_ascii=False) if not isinstance(message, str) else message
        await r.publish(channel, msg)
        return True
    except Exception as e:
        logger.debug("redis_publish error: %s", e)
        return False


async def redis_ttl(key: str) -> int:
    r = await get_redis()
    if r is None:
        return -1
    try:
        return await r.ttl(key)
    except Exception:
        return -1


async def redis_close() -> None:
    global _redis
    if _redis is not None:
        try:
            await _redis.close()
        except Exception:
            pass
        _redis = None
