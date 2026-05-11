from contextlib import contextmanager
from pathlib import Path
from typing import Generator

import duckdb
import structlog

log = structlog.get_logger()


@contextmanager
def duckdb_connect() -> Generator[duckdb.DuckDBPyConnection, None, None]:
    conn = duckdb.connect(":memory:")
    try:
        yield conn
    finally:
        conn.close()


def csv_to_parquet(
    csv_path: Path,
    parquet_path: Path,
    *,
    delimiter: str = "|",
    columns: list[str] | None = None,
    header: bool = False,
) -> int:
    with duckdb_connect() as conn:
        if columns and not header:
            names_str = ", ".join(f"'{c}'" for c in columns)
            query = f"""
                COPY (
                    SELECT * FROM read_csv('{csv_path}',
                        delim='{delimiter}',
                        header=false,
                        names=[{names_str}],
                        all_varchar=true,
                        ignore_errors=true
                    )
                ) TO '{parquet_path}' (FORMAT PARQUET, COMPRESSION ZSTD)
            """
        else:
            query = f"""
                COPY (
                    SELECT * FROM read_csv('{csv_path}',
                        delim='{delimiter}',
                        header={'true' if header else 'false'},
                        all_varchar=true,
                        ignore_errors=true
                    )
                ) TO '{parquet_path}' (FORMAT PARQUET, COMPRESSION ZSTD)
            """
        conn.execute(query)
        count = conn.execute(
            f"SELECT count(*) FROM read_parquet('{parquet_path}')"
        ).fetchone()[0]
    log.info("csv_to_parquet", source=str(csv_path), dest=str(parquet_path), rows=count)
    return count


def read_parquet_batched(
    parquet_path: Path,
    batch_size: int = 50_000,
) -> Generator[list[dict], None, None]:
    with duckdb_connect() as conn:
        rel = conn.read_parquet(str(parquet_path))
        offset = 0
        while True:
            batch = rel.limit(batch_size, offset=offset).fetchdf()
            if batch.empty:
                break
            yield batch.to_dict("records")
            offset += batch_size
