"""FastAPI dependencies — DB session, auth, etc."""
import uuid
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import validate_token
from app.config import settings
from app.db.session import get_engine, async_session_factory

_engine = None
_session_factory = None


def _get_session_factory():
    global _engine, _session_factory
    if _session_factory is None:
        _engine = get_engine(settings.async_database_url)
        _session_factory = async_session_factory(_engine)
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = _get_session_factory()
    async with factory() as session:
        yield session


async def get_current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization[7:]
    try:
        payload = await validate_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user ID")
    return {"user_id": uuid.UUID(user_id), "payload": payload}


async def get_optional_user(authorization: str = Header(default="")) -> dict | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None
