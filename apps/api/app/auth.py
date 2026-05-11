"""Neon Auth (Better Auth) JWT validation.

Validates JWTs issued by Neon Auth using JWKS (EdDSA/Ed25519).
"""
import ssl
import time
from typing import Any

import certifi
import httpx
import jwt
from jwt import PyJWK
import structlog

from app.config import settings

log = structlog.get_logger()

_jwks_cache: dict[str, Any] = {}
_jwks_cache_ttl: float = 0
_JWKS_CACHE_DURATION = 3600


async def _fetch_jwks() -> dict | None:
    """Fetch JWKS from Neon Auth endpoint using httpx (handles SSL properly)."""
    global _jwks_cache, _jwks_cache_ttl

    if _jwks_cache and time.time() < _jwks_cache_ttl:
        return _jwks_cache

    if not settings.neon_auth_url:
        return None

    jwks_url = f"{settings.neon_auth_url}/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(jwks_url, timeout=10)
            if resp.status_code == 200:
                _jwks_cache = resp.json()
                _jwks_cache_ttl = time.time() + _JWKS_CACHE_DURATION
                log.info("jwks_refreshed", url=jwks_url, keys=len(_jwks_cache.get("keys", [])))
                return _jwks_cache
    except httpx.HTTPError as e:
        log.error("jwks_fetch_failed", url=jwks_url, error=str(e))

    return None


def _find_signing_key(jwks: dict, token: str) -> Any:
    """Find the correct signing key from JWKS for the given token."""
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")
    alg = unverified_header.get("alg")

    for key_data in jwks.get("keys", []):
        if kid and key_data.get("kid") != kid:
            continue
        jwk = PyJWK(key_data)
        return jwk.key, key_data.get("alg", alg)

    raise ValueError(f"No matching key found for kid={kid}")


async def validate_token(token: str) -> dict:
    """Validate a Neon Auth JWT using JWKS."""
    if not token:
        raise ValueError("Missing token")

    jwks = await _fetch_jwks()
    if jwks is None:
        raise ValueError("Auth not configured or JWKS unavailable")

    try:
        key, alg = _find_signing_key(jwks, token)
        payload = jwt.decode(
            token,
            key,
            algorithms=[alg, "EdDSA", "RS256", "ES256"],
            options={"verify_aud": False},
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token expired")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Invalid token: {e}")
