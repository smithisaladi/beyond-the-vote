import pytest
from app.db.session import get_engine, async_session_factory


def test_get_engine_returns_engine():
    engine = get_engine("postgresql+asyncpg://localhost/test")
    assert engine is not None
    assert "asyncpg" in str(engine.url)


def test_async_session_factory_returns_maker():
    engine = get_engine("postgresql+asyncpg://localhost/test")
    factory = async_session_factory(engine)
    assert factory is not None
