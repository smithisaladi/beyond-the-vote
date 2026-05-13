import pytest
from app.auth import validate_token


@pytest.mark.asyncio
async def test_validate_token_missing():
    with pytest.raises(ValueError, match="Missing"):
        await validate_token("")


@pytest.mark.asyncio
async def test_validate_token_malformed():
    with pytest.raises(ValueError):
        await validate_token("not-a-jwt-token")
