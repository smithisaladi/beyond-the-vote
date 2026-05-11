"""Neon Auth (Better Auth) JWT validation.

Validates JWTs issued by Neon Auth using the configured secret.
Falls back to JWKS-based validation if a JWKS endpoint is available.
"""
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


async def _get_jwks() -> dict | None:
    """Try to fetch JWKS from Neon Auth endpoint."""
    global _jwks_cache, _jwks_cache_ttl

    if _jwks_cache and time.time() < _jwks_cache_ttl:
        return _jwks_cache

    if not settings.neon_auth_url:
        return None

    # Better Auth JWKS endpoint
    jwks_url = f"{settings.neon_auth_url}/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(jwks_url, timeout=10)
            if resp.status_code == 200:
                _jwks_cache = resp.json()
                _jwks_cache_ttl = time.time() + _JWKS_CACHE_DURATION
                log.info("jwks_refreshed", url=jwks_url)
                return _jwks_cache
    except httpx.HTTPError:
        pass

    return None


def decode_jwt_with_secret(token: str) -> dict:
    """Decode JWT using the configured secret (HS256)."""
    if not token:
        raise ValueError("Missing token")
    if not settings.neon_auth_jwt_secret:
        raise ValueError("NEON_AUTH_JWT_SECRET not configured")

    try:
        payload = jwt.decode(
            token,
            settings.neon_auth_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")


async def validate_token(token: str) -> dict:
    """Validate a Neon Auth JWT. Tries JWKS first, falls back to secret."""
    if not token:
        raise ValueError("Missing token")

    # Try JWKS-based validation
    jwks = await _get_jwks()
    if jwks:
        try:
            payload = jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
            return payload
        except httpx.HTTPError:
            pass  # Network error — fall back to secret
        except JWTError:
            raise ValueError("Invalid token")

    # Fall back to HS256 with secret
    return decode_jwt_with_secret(token)
