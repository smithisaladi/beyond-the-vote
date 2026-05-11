"""
Shared utilities: DB connection, batch helpers, ZIP extraction, FEC streaming,
API request wrapper, date normalization.
"""

import csv
import functools
import io
import logging
import os
import threading
import time
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Iterator

import requests
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)


def log_timing(func):
    """Decorator that logs function execution time."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.monotonic()
        result = func(*args, **kwargs)
        elapsed = time.monotonic() - start
        if elapsed > 1.0:
            log.info("%s took %.1fs", func.__name__, elapsed)
        else:
            log.debug("%s took %.3fs", func.__name__, elapsed)
        return result
    return wrapper


class ApiResponseError(Exception):
    """Raised when an API returns an unparseable or unexpected response."""
    pass


# ── Batching ──────────────────────────────────────────────────────────────────

def batch(iterable, size: int) -> Generator[list, None, None]:
    """Yield successive chunks of `size` items from any iterable."""
    buf: list = []
    for item in iterable:
        buf.append(item)
        if len(buf) >= size:
            yield buf
            buf = []
    if buf:
        yield buf


# ── ZIP extraction ────────────────────────────────────────────────────────────

def extract_zip(zip_path: Path, dest_dir: Path) -> Path:
    """
    Extract a zip archive to dest_dir and return the path to the first .txt file found.
    Raises FileNotFoundError if no .txt file is present.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest_dir)
        txt_files = [f for f in zf.namelist() if f.lower().endswith(".txt")]
        if not txt_files:
            raise FileNotFoundError(f"No .txt file found in {zip_path}")
        return dest_dir / txt_files[0]


# ── FEC file streaming ────────────────────────────────────────────────────────

def stream_fec_file(
    txt_path: Path,
    cols: list[str],
    chunk_size: int = 50_000,
    skip_chunks: int = 0,
) -> Generator[list[dict], None, None]:
    """
    Stream a pipe-delimited FEC file (no header row) yielding chunks of dicts.

    Args:
        txt_path:    Path to the unzipped .txt file.
        cols:        Column names to assign (from FEC data dictionary).
        chunk_size:  Number of rows per yielded chunk.
        skip_chunks: Number of already-processed chunks to skip (for resuming).
    """
    chunk_index = 0
    chunk: list[dict] = []

    with open(txt_path, encoding="latin-1", errors="replace") as f:
        reader = csv.reader(f, delimiter="|")
        for row in reader:
            if not row:
                continue
            # Pad short rows, trim long ones
            if len(row) < len(cols):
                row.extend([""] * (len(cols) - len(row)))
            record = {cols[i]: row[i].strip() for i in range(len(cols))}
            chunk.append(record)

            if len(chunk) >= chunk_size:
                if chunk_index >= skip_chunks:
                    yield chunk_index, chunk
                chunk_index += 1
                chunk = []

    if chunk:
        if chunk_index >= skip_chunks:
            yield chunk_index, chunk


def stream_fec_file_rows(
    txt_path: Path,
    cols: list[str],
) -> Generator[dict, None, None]:
    """Stream individual rows (for building in-memory lookup dicts)."""
    with open(txt_path, encoding="latin-1", errors="replace") as f:
        reader = csv.reader(f, delimiter="|")
        for row in reader:
            if not row:
                continue
            if len(row) < len(cols):
                row.extend([""] * (len(cols) - len(row)))
            yield {cols[i]: row[i].strip() for i in range(len(cols))}


# ── API request wrapper ───────────────────────────────────────────────────────

_request_count = 0
_window_start = time.monotonic()
_rate_lock = threading.Lock()


@log_timing
def api_get(
    url: str,
    params: dict | None = None,
    api_key: str | None = None,
    max_retries: int = 3,
    rate_limit: int = 950,
) -> dict | None:
    """
    GET with retry + hourly rate limiting.
    Returns parsed JSON or None on permanent failure.
    """
    global _request_count, _window_start

    if api_key:
        params = params or {}
        params["api_key"] = api_key

    # Rate limit: if we've hit the threshold in the current hour, sleep until reset
    with _rate_lock:
        elapsed = time.monotonic() - _window_start
        if _request_count >= rate_limit:
            sleep_for = max(0, 3600 - elapsed)
            log.info("Rate limit approached (%d req). Sleeping %.0fs.", _request_count, sleep_for)
            time.sleep(sleep_for)
            _request_count = 0
            _window_start = time.monotonic()

    for attempt in range(max_retries):
        try:
            resp = requests.get(url, params=params, timeout=30)
            with _rate_lock:
                _request_count += 1

            if resp.status_code == 200:
                try:
                    return resp.json()
                except ValueError:
                    log.warning("Non-JSON response from %s (body: %r…)", url, resp.text[:200])
                    raise ApiResponseError(f"Non-JSON response from {url}")
            elif resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 60))
                log.warning("429 rate limited. Sleeping %ds.", retry_after)
                time.sleep(retry_after)
            elif resp.status_code in (500, 502, 503, 504):
                wait = 2 ** attempt * 5
                log.warning("HTTP %d. Retrying in %ds.", resp.status_code, wait)
                time.sleep(wait)
            else:
                log.error("HTTP %d for %s — skipping.", resp.status_code, url)
                return None
        except requests.RequestException as e:
            wait = 2 ** attempt * 5
            log.warning("Request error (%s). Retrying in %ds.", e, wait)
            time.sleep(wait)

    log.error("Giving up on %s after %d attempts.", url, max_retries)
    return None


@log_timing
def download_file(url: str, dest: Path) -> Path:
    """Download a file to dest, streaming to avoid loading into memory."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    log.info("Downloading %s → %s", url, dest)
    with requests.get(url, stream=True, timeout=120) as resp:
        resp.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    return dest


# ── Date helpers ──────────────────────────────────────────────────────────────

def normalize_fec_date(dt_str: str) -> str | None:
    """Convert FEC MMDDYYYY date string to ISO YYYY-MM-DD. Returns None if unparseable."""
    if not dt_str or len(dt_str) != 8:
        return None
    try:
        return f"{dt_str[4:8]}-{dt_str[0:2]}-{dt_str[2:4]}"
    except Exception:
        return None


def safe_numeric(val: str) -> float | None:
    """Parse a string to float, returning None on failure."""
    try:
        return float(val) if val.strip() else None
    except (ValueError, AttributeError):
        return None


def safe_int(val: str) -> int | None:
    try:
        return int(val) if val.strip() else None
    except (ValueError, AttributeError):
        return None


# ── DuckDB ───────────────────────────────────────────────────────────────────

@contextmanager
def duckdb_connect():
    """Yield an in-memory DuckDB connection. Use for local CSV aggregation."""
    import duckdb

    conn = duckdb.connect(":memory:")
    try:
        yield conn
    finally:
        conn.close()


# ── CSV helpers (pipe-delimited, FEC convention) ─────────────────────────────

def append_csv(path: Path, rows: list[dict], cols: list[str]) -> None:
    """Append rows to a pipe-delimited CSV. Creates with header if new."""
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    is_new = not path.exists() or path.stat().st_size == 0
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=cols, delimiter="|", extrasaction="ignore")
        if is_new:
            writer.writeheader()
        writer.writerows(rows)
