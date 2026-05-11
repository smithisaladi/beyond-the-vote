import pytest
from app.auth import decode_jwt


def test_decode_jwt_missing_token():
    with pytest.raises(ValueError, match="Missing"):
        decode_jwt("")


def test_decode_jwt_malformed_token():
    with pytest.raises(ValueError):
        decode_jwt("not-a-jwt-token")
