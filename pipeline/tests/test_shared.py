import pytest
from pipeline.shared.observability import configure_logging
from pipeline.shared.parquet import duckdb_connect


def test_configure_logging_does_not_raise():
    configure_logging(service="test-pipeline")


def test_duckdb_connect_context_manager():
    with duckdb_connect() as conn:
        result = conn.execute("SELECT 1 AS val").fetchone()
        assert result[0] == 1


def test_duckdb_connect_closes_on_exit():
    with duckdb_connect() as conn:
        pass
    with pytest.raises(Exception):
        conn.execute("SELECT 1")
