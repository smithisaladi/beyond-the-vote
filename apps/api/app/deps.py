"""FastAPI dependencies — DB session, auth, etc."""
import uuid
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import validate_token


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    async with request.app.state.session_factory() as session:
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
    # Neon Auth may use non-UUID IDs — keep as string, cast to UUID only if valid
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        parsed_id = user_id
    return {"user_id": parsed_id, "payload": payload}


async def get_optional_user(authorization: str = Header(default="")) -> dict | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException as e:
        if e.status_code == 401:
            return None
        raise
