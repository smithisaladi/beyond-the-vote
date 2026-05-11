"""Supabase JWT validation via JWKS."""
import time
from typing import Any

import httpx
import structlog
from jose import jwt, JWTError

from app.config import settings

log = structlog.get_logger()

_jwks_cache: dict[str, Any] = {}
_jwks_cache_ttl: float = 0
_JWKS_CACHE_DURATION = 3600


async def _get_jwks() -> dict:
    global _jwks_cache, _jwks_cache_ttl
    if _jwks_cache and time.time() < _jwks_cache_ttl:
        return _jwks_cache
    jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cache_ttl = time.time() + _JWKS_CACHE_DURATION
    log.info("jwks_refreshed")
    return _jwks_cache


def decode_jwt(token: str) -> dict:
    if not token:
        raise ValueError("Missing token")
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")


async def validate_token(token: str) -> dict:
    if not token:
        raise ValueError("Missing token")
    if settings.supabase_url:
        try:
            jwks = await _get_jwks()
            payload = jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
            return payload
        except httpx.HTTPError:
            pass  # Network error — fall back to secret
        except JWTError:
            # Token validation failed with JWKS — don't silently fall back
            raise ValueError("Invalid token")
    return decode_jwt(token)
