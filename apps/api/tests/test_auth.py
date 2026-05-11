import pytest
from app.auth import decode_jwt_with_secret


def test_decode_jwt_missing_token():
    with pytest.raises(ValueError, match="Missing"):
        decode_jwt_with_secret("")


def test_decode_jwt_malformed_token():
    with pytest.raises(ValueError):
        decode_jwt_with_secret("not-a-jwt-token")
