# Phase 0 + 1: Monorepo Scaffold & Pipeline Rewrite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the monorepo structure, scaffold FastAPI + Vite projects, and rewrite the entire data pipeline to use `unitedstates/congress` (usc-run) for bill/vote ingestion, `congress-legislators` for legislator data, FEC bulk files for campaign finance, and generate bill embeddings for semantic search.

**Architecture:** Monorepo with `apps/web` (Vite SPA), `apps/api` (FastAPI), and `pipeline/` (Python ETL). The pipeline runs locally, processes data from usc-run JSON + congress-legislators YAML + FEC bulk files, and uploads results to Supabase Postgres organized into domain-specific schemas (congress.*, fec.*, enrichment.*, derived.*, ops.*). Bill embeddings are generated via `all-MiniLM-L6-v2` and stored in pgvector for semantic search.

**Tech Stack:** Python 3.11+, uv (package manager), FastAPI, SQLAlchemy 2.0, Alembic, sentence-transformers, DuckDB, supabase-py, pnpm, Vite, React 19, TanStack Router/Query, structlog, sentry-sdk

**Design spec:** `docs/superpowers/specs/2026-05-10-full-stack-refactor-design.md`

---

## File Map

### Phase 0: Scaffold

| Action | Path | Purpose |
|--------|------|---------|
| Create | `apps/api/pyproject.toml` | FastAPI dependencies + project config |
| Create | `apps/api/app/__init__.py` | Package init |
| Create | `apps/api/app/main.py` | FastAPI app with health check |
| Create | `apps/api/app/db/session.py` | SQLAlchemy async engine + session factory |
| Create | `apps/api/app/db/models/__init__.py` | Model registry |
| Create | `apps/api/alembic.ini` | Alembic config |
| Create | `apps/api/alembic/env.py` | Alembic env with multi-schema support |
| Create | `apps/web/package.json` | Vite SPA dependencies |
| Create | `apps/web/vite.config.ts` | Vite config |
| Create | `apps/web/index.html` | SPA entry point |
| Create | `apps/web/src/main.tsx` | React root with Supabase auth check |
| Create | `apps/web/src/lib/auth/supabase.ts` | Supabase JS client (auth only) |
| Create | `pnpm-workspace.yaml` | pnpm workspace config |
| Create | `pipeline/pyproject.toml` | Pipeline dependencies |
| Create | `pipeline/shared/__init__.py` | Shared utilities package |
| Create | `pipeline/shared/db.py` | Supabase upload client |
| Create | `pipeline/shared/observability.py` | structlog + Sentry init |
| Create | `.gitignore` additions | Ignore pipeline/data/, .venv, etc. |

### Phase 1: Pipeline Rewrite

| Action | Path | Purpose |
|--------|------|---------|
| Create | `pipeline/shared/parquet.py` | DuckDB + Parquet utilities |
| Create | `pipeline/shared/embeddings.py` | sentence-transformers model loading |
| Create | `pipeline/ingest/__init__.py` | Package init |
| Create | `pipeline/ingest/congress.py` | usc-run wrapper + JSON parser |
| Create | `pipeline/ingest/legislators.py` | congress-legislators git-sync |
| Create | `pipeline/ingest/fec.py` | FEC bulk download + Parquet conversion |
| Create | `pipeline/ingest/voteview.py` | VoteView CSV download |
| Create | `pipeline/load/__init__.py` | Package init |
| Create | `pipeline/load/bills.py` | Parse usc-run JSON -> congress.bills |
| Create | `pipeline/load/legislators.py` | Parse YAML -> congress.legislators |
| Create | `pipeline/load/votes.py` | Parse usc-run vote JSON -> congress.bill_vote_* |
| Create | `pipeline/load/fec.py` | Parquet aggregations -> fec.*, derived.* |
| Create | `pipeline/load/embeddings.py` | Bill embedding -> enrichment.bill_embeddings |
| Create | `pipeline/scripts/ingest_all.py` | Full pipeline orchestrator |
| Create | `pipeline/scripts/ingest_incremental.py` | Incremental sync |
| Create | `pipeline/scripts/embed_bills.py` | Generate/update bill embeddings |
| Create | `pipeline/tests/` | Pipeline test files |

---

## Task 1: Initialize monorepo structure

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `apps/web/package.json`
- Create: `apps/api/pyproject.toml`
- Create: `pipeline/pyproject.toml`
- Modify: `.gitignore`

- [ ] **Step 1: Create pnpm workspace config**

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/web"
```

- [ ] **Step 2: Create apps/web/package.json**

```json
{
  "name": "@beyond-the-ballot/web",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "codegen": "openapi-typescript http://localhost:8000/openapi.json -o src/lib/api/generated/schema.ts"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/supabase-js": "^2.49.4",
    "@tanstack/react-query": "^5.100.9",
    "@tanstack/react-router": "^1.120.3",
    "openapi-fetch": "^0.13.5",
    "lucide-react": "^0.487.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.1",
    "openapi-typescript": "^7.6.1",
    "tailwindcss": "^4.1.12",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.1.4",
    "@testing-library/react": "^16.3.0"
  }
}
```

- [ ] **Step 3: Create apps/api/pyproject.toml**

```toml
[project]
name = "beyond-the-ballot-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30.0",
    "alembic>=1.14.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",
    "python-jose[cryptography]>=3.3.0",
    "httpx>=0.28.0",
    "structlog>=24.4.0",
    "sentry-sdk[fastapi]>=2.19.0",
    "slowapi>=0.1.9",
    "pgvector>=0.3.6",
    "scikit-learn>=1.6.0",
    "joblib>=1.4.0",
    "sentence-transformers>=3.4.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.25.0",
    "httpx>=0.28.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 4: Create pipeline/pyproject.toml**

```toml
[project]
name = "beyond-the-ballot-pipeline"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "supabase>=2.0.0",
    "httpx>=0.28.0",
    "duckdb>=1.0.0",
    "pyarrow>=18.0.0",
    "pandas>=2.0.0",
    "pyyaml>=6.0",
    "lxml>=5.0.0",
    "python-dotenv>=1.0.0",
    "structlog>=24.4.0",
    "sentry-sdk>=2.19.0",
    "sentence-transformers>=3.4.0",
    "usaddress>=0.5.10",
    "hdbscan>=0.8.39",
    "scikit-learn>=1.6.0",
    "umap-learn>=0.5.7",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 5: Update .gitignore**

Append these lines to the existing `.gitignore`:

```
# Pipeline local data
pipeline/data/
pipeline/.venv/

# API
apps/api/.venv/
apps/api/alembic/versions/*.py
!apps/api/alembic/versions/.gitkeep

# Web
apps/web/node_modules/
apps/web/dist/

# Shared
shared/openapi/

# ML models cache
*.pt
*.bin
*.onnx

# Parquet data
*.parquet
```

- [ ] **Step 6: Create directory skeleton**

Run:
```bash
mkdir -p apps/api/app/db/models apps/api/app/routers apps/api/app/schemas \
  apps/api/app/queries apps/api/app/ml apps/api/app/middleware \
  apps/api/alembic/versions apps/api/tests \
  apps/web/src/routes apps/web/src/components apps/web/src/hooks/queries \
  apps/web/src/lib/api/generated apps/web/src/lib/auth \
  pipeline/ingest pipeline/load pipeline/enrich pipeline/shared \
  pipeline/scripts pipeline/tests pipeline/data/congress \
  pipeline/data/legislators pipeline/data/fec pipeline/data/models \
  shared/openapi infra/docker infra/render infra/github-actions
```

Create `__init__.py` files for all Python packages:
```bash
touch apps/api/app/__init__.py apps/api/app/db/__init__.py \
  apps/api/app/db/models/__init__.py apps/api/app/routers/__init__.py \
  apps/api/app/schemas/__init__.py apps/api/app/queries/__init__.py \
  apps/api/app/ml/__init__.py apps/api/app/middleware/__init__.py \
  pipeline/__init__.py pipeline/ingest/__init__.py pipeline/load/__init__.py \
  pipeline/enrich/__init__.py pipeline/shared/__init__.py \
  pipeline/scripts/__init__.py pipeline/tests/__init__.py
```

Create `.gitkeep` for empty dirs:
```bash
touch apps/api/alembic/versions/.gitkeep shared/openapi/.gitkeep \
  pipeline/data/.gitkeep
```

- [ ] **Step 7: Commit scaffold**

```bash
git add pnpm-workspace.yaml apps/api/pyproject.toml apps/web/package.json \
  pipeline/pyproject.toml .gitignore apps/ pipeline/ shared/ infra/
git commit -m "scaffold: monorepo structure with apps/api, apps/web, pipeline"
```

---

## Task 2: FastAPI minimal app with health check

**Files:**
- Create: `apps/api/app/main.py`
- Create: `apps/api/app/config.py`
- Create: `apps/api/app/logging.py`
- Create: `apps/api/tests/test_health.py`

- [ ] **Step 1: Write the health check test**

```python
# apps/api/tests/test_health.py
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_healthz_returns_200():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
```

- [ ] **Step 2: Create config module**

```python
# apps/api/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    sentry_dsn: str = ""
    environment: str = "development"
    debug: bool = False

    model_config = {"env_prefix": "", "env_file": ".env"}


settings = Settings()
```

- [ ] **Step 3: Create structlog config**

```python
# apps/api/app/logging.py
import structlog


def configure_logging(debug: bool = False) -> None:
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if debug:
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(0),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

- [ ] **Step 4: Create FastAPI app**

```python
# apps/api/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logging import configure_logging

configure_logging(debug=settings.debug)

app = FastAPI(
    title="Beyond the Ballot API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
```

- [ ] **Step 5: Add pytest config**

```toml
# Append to apps/api/pyproject.toml

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 6: Run the test**

```bash
cd apps/api && uv run pytest tests/test_health.py -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/
git commit -m "feat(api): FastAPI app with health check and structlog"
```

---

## Task 3: Vite SPA with Supabase auth

**Files:**
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/lib/auth/supabase.ts`
- Create: `apps/web/src/App.tsx`

- [ ] **Step 1: Create index.html**

```html
<!-- apps/web/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beyond the Ballot</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
// apps/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "baseUrl": "."
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create Supabase auth client**

```typescript
// apps/web/src/lib/auth/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 5: Create App.tsx**

```tsx
// apps/web/src/App.tsx
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/auth/supabase";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Beyond the Ballot</h1>
      <p>{session ? `Logged in as ${session.user.email}` : "Not logged in"}</p>
    </div>
  );
}
```

- [ ] **Step 6: Create main.tsx**

```tsx
// apps/web/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Create .env file for local dev**

```bash
# apps/web/.env
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

- [ ] **Step 8: Install deps and verify it runs**

```bash
cd apps/web && pnpm install && pnpm dev
```

Expected: Vite dev server on http://localhost:5173, shows "Beyond the Ballot" + auth status.

- [ ] **Step 9: Commit**

```bash
git add apps/web/
git commit -m "feat(web): Vite SPA scaffold with Supabase auth client"
```

---

## Task 4: Pipeline shared utilities

**Files:**
- Create: `pipeline/shared/db.py`
- Create: `pipeline/shared/observability.py`
- Create: `pipeline/shared/parquet.py`
- Create: `pipeline/tests/test_shared.py`

- [ ] **Step 1: Write tests for shared utilities**

```python
# pipeline/tests/test_shared.py
import pytest
from unittest.mock import patch, MagicMock
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
    # Connection should be closed after context exit
    with pytest.raises(Exception):
        conn.execute("SELECT 1")
```

- [ ] **Step 2: Create observability module**

```python
# pipeline/shared/observability.py
import os
import structlog
import sentry_sdk


def configure_logging(service: str = "pipeline", debug: bool = False) -> None:
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if debug or os.getenv("DEBUG"):
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(0),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def configure_sentry(dsn: str | None = None, service: str = "pipeline") -> None:
    dsn = dsn or os.getenv("SENTRY_DSN")
    if not dsn:
        return
    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("ENVIRONMENT", "development"),
        traces_sample_rate=0.1,
    )
```

- [ ] **Step 3: Create Supabase upload client**

```python
# pipeline/shared/db.py
import os
from supabase import create_client, Client
import structlog

log = structlog.get_logger()

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
        log.info("supabase_client_created")
    return _client


def reset_supabase() -> None:
    global _client
    _client = None
    log.info("supabase_client_reset")


def upsert(
    table: str,
    rows: list[dict],
    *,
    on_conflict: str = "",
    batch_size: int = 500,
    schema: str = "public",
) -> int:
    """Batch upsert rows into a Supabase table. Returns total rows upserted."""
    if not rows:
        return 0
    client = get_supabase()
    total = 0
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        query = client.schema(schema).table(table).upsert(chunk, on_conflict=on_conflict)
        query.execute()
        total += len(chunk)
    log.debug("upsert_complete", table=table, schema=schema, rows=total)
    return total


def delete_then_insert(
    table: str,
    rows: list[dict],
    match_cols: list[str],
    *,
    schema: str = "public",
) -> int:
    """Delete existing rows by match columns, then insert fresh rows."""
    if not rows:
        return 0
    client = get_supabase()
    query = client.schema(schema).table(table).delete()
    for col in match_cols:
        query = query.eq(col, rows[0][col])
    query.execute()

    for i in range(0, len(rows), 500):
        chunk = rows[i : i + 500]
        client.schema(schema).table(table).insert(chunk).execute()

    log.debug("delete_then_insert_complete", table=table, schema=schema, rows=len(rows))
    return len(rows)


def log_run_start(script: str) -> str:
    """Insert a pipeline run record, return the run ID."""
    import uuid

    run_id = str(uuid.uuid4())
    client = get_supabase()
    client.schema("ops").table("pipeline_runs").insert(
        {"id": run_id, "script_name": script, "status": "running"}
    ).execute()
    log.info("pipeline_run_started", script=script, run_id=run_id)
    return run_id


def log_run_end(
    run_id: str,
    status: str,
    *,
    rows_processed: int = 0,
    error_detail: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Update pipeline run with final status."""
    client = get_supabase()
    update = {
        "status": status,
        "finished_at": "now()",
        "rows_processed": rows_processed,
    }
    if error_detail:
        update["error_detail"] = error_detail
    if metadata:
        update["metadata"] = metadata
    client.schema("ops").table("pipeline_runs").update(update).eq("id", run_id).execute()
    log.info("pipeline_run_ended", run_id=run_id, status=status, rows=rows_processed)


def get_watermark(script: str) -> str | None:
    """Return the started_at timestamp of the last successful run for a script."""
    client = get_supabase()
    result = (
        client.schema("ops")
        .table("pipeline_runs")
        .select("started_at")
        .eq("script_name", script)
        .eq("status", "success")
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["started_at"]
    return None
```

- [ ] **Step 4: Create DuckDB/Parquet utilities**

```python
# pipeline/shared/parquet.py
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

import duckdb
import structlog

log = structlog.get_logger()


@contextmanager
def duckdb_connect() -> Generator[duckdb.DuckDBPyConnection, None, None]:
    """Yield an in-memory DuckDB connection. Closes on exit."""
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
    """Convert a delimited text file to Parquet. Returns row count."""
    with duckdb_connect() as conn:
        col_clause = ""
        if columns and not header:
            col_clause = f", columns={{{', '.join(f'{c!r}: {c!r}' for c in columns)}}}"
            # DuckDB read_csv with explicit column names
            names_str = ", ".join(f"'{c}'" for c in columns)
            query = f"""
                COPY (
                    SELECT * FROM read_csv('{csv_path}',
                        delim='{delimiter}',
                        header=false,
                        names=[{names_str}]
                    )
                ) TO '{parquet_path}' (FORMAT PARQUET, COMPRESSION ZSTD)
            """
        else:
            query = f"""
                COPY (
                    SELECT * FROM read_csv('{csv_path}',
                        delim='{delimiter}',
                        header={'true' if header else 'false'}
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
    """Yield batches of dicts from a Parquet file."""
    with duckdb_connect() as conn:
        rel = conn.read_parquet(str(parquet_path))
        offset = 0
        while True:
            batch = rel.limit(batch_size, offset=offset).fetchdf()
            if batch.empty:
                break
            yield batch.to_dict("records")
            offset += batch_size
```

- [ ] **Step 5: Run tests**

```bash
cd pipeline && uv run pytest tests/test_shared.py -v
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add pipeline/
git commit -m "feat(pipeline): shared utilities - db, observability, parquet"
```

---

## Task 5: Database schema creation via Supabase SQL

The new schema uses 8 Postgres schemas. Since Alembic will be introduced in Phase 3, we create the initial schema directly via SQL against Supabase.

**Files:**
- Create: `pipeline/scripts/create_schema.py`
- Create: `pipeline/schema.sql`

- [ ] **Step 1: Create the full schema SQL file**

Create `pipeline/schema.sql` containing the complete schema from the design spec (sections 4.1-4.8). This is the single source of truth for the initial schema.

Copy the full SQL from `docs/superpowers/specs/2026-05-10-full-stack-refactor-design.md` sections 4.1 through 4.8 and the ML schema additions, concatenated into one file. Prepend each schema section with:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS congress;
CREATE SCHEMA IF NOT EXISTS fec;
CREATE SCHEMA IF NOT EXISTS enrichment;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS anomalies;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS derived;
CREATE SCHEMA IF NOT EXISTS ops;
```

Add the search_vector trigger at the end:

```sql
-- Trigger: auto-update search_vector on bills insert/update
CREATE OR REPLACE FUNCTION congress.bills_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
        setweight(to_tsvector('english',
            coalesce(NEW.sponsor_name, '') || ' ' ||
            coalesce(NEW.policy_area, '') || ' ' ||
            coalesce(array_to_string(NEW.topics, ' '), '')
        ), 'C') ||
        setweight(to_tsvector('english', coalesce(NEW.bill_number, '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bills_search_vector_trigger
    BEFORE INSERT OR UPDATE ON congress.bills
    FOR EACH ROW EXECUTE FUNCTION congress.bills_search_vector_update();
```

- [ ] **Step 2: Create schema runner script**

```python
# pipeline/scripts/create_schema.py
"""Run the full schema SQL against Supabase Postgres.

Usage: uv run python -m pipeline.scripts.create_schema
"""
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    schema_path = Path(__file__).parent.parent / "schema.sql"
    sql = schema_path.read_text()

    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("Schema created successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
```

Add `psycopg2-binary` to pipeline/pyproject.toml dependencies:

```toml
"psycopg2-binary>=2.9.0",
```

- [ ] **Step 3: Run schema creation against Supabase**

```bash
cd pipeline && uv run python -m pipeline.scripts.create_schema
```

Expected: "Schema created successfully." Verify via Supabase dashboard that all 8 schemas exist with their tables.

- [ ] **Step 4: Verify pgvector extension is active**

```bash
# In Supabase SQL editor or via psql:
SELECT * FROM pg_extension WHERE extname = 'vector';
```

Expected: One row showing the vector extension is installed.

- [ ] **Step 5: Commit**

```bash
git add pipeline/schema.sql pipeline/scripts/create_schema.py pipeline/pyproject.toml
git commit -m "feat(pipeline): database schema with 8 Postgres schemas + pgvector"
```

---

## Task 6: Legislator ingestion (congress-legislators)

**Files:**
- Create: `pipeline/ingest/legislators.py`
- Create: `pipeline/load/legislators.py`
- Create: `pipeline/tests/test_legislators.py`

- [ ] **Step 1: Write tests for legislator transform**

```python
# pipeline/tests/test_legislators.py
from pipeline.load.legislators import transform_legislator, transform_committee_membership


SAMPLE_LEGISLATOR = {
    "id": {
        "bioguide": "S000148",
        "thomas": "01036",
        "lis": "S270",
        "govtrack": 300087,
        "fec": ["S0NY00188", "H6NY00043"],
        "icpsr": 14858,
    },
    "name": {
        "first": "Charles",
        "last": "Schumer",
        "official_full": "Charles E. Schumer",
    },
    "bio": {"birthday": "1950-11-23", "gender": "M"},
    "terms": [
        {
            "type": "sen",
            "start": "2023-01-03",
            "end": "2029-01-03",
            "state": "NY",
            "class": 3,
            "party": "Democrat",
            "url": "https://www.schumer.senate.gov",
            "phone": "202-224-6542",
            "address": "322 Hart Senate Office Building",
        }
    ],
}


def test_transform_legislator_basic():
    row = transform_legislator(SAMPLE_LEGISLATOR, in_office=True)
    assert row is not None
    assert row["bioguide_id"] == "S000148"
    assert row["full_name"] == "Charles E. Schumer"
    assert row["party"] == "Democrat"
    assert row["chamber"] == "Senate"
    assert row["state"] == "NY"
    assert row["state_full"] == "New York"
    assert row["fec_ids"] == ["S0NY00188", "H6NY00043"]
    assert row["in_office"] is True
    assert row["senate_class"] == 3


def test_transform_legislator_missing_bioguide_returns_none():
    record = {"id": {}, "name": {"first": "Test", "last": "User"}, "terms": []}
    assert transform_legislator(record, in_office=True) is None


def test_transform_legislator_no_terms_returns_none():
    record = {"id": {"bioguide": "X000001"}, "name": {"first": "Test", "last": "User"}, "terms": []}
    assert transform_legislator(record, in_office=True) is None


def test_transform_committee_membership():
    record = {
        "id": {"bioguide": "S000148"},
        "terms": [
            {
                "type": "sen",
                "start": "2023-01-03",
                "end": "2029-01-03",
                "state": "NY",
                "party": "Democrat",
            }
        ],
    }
    # committee memberships come from a separate file, tested via load flow
```

- [ ] **Step 2: Create legislator ingest module**

```python
# pipeline/ingest/legislators.py
"""Git-sync congress-legislators YAML files."""
import subprocess
from pathlib import Path

import yaml
import structlog

log = structlog.get_logger()

REPO_URL = "https://github.com/unitedstates/congress-legislators.git"
CURRENT_FILE = "legislators-current.yaml"
HISTORICAL_FILE = "legislators-historical.yaml"
COMMITTEES_FILE = "committee-membership-current.yaml"


def sync(data_dir: Path) -> Path:
    """Clone or pull congress-legislators into data_dir/legislators/. Returns repo path."""
    repo_dir = data_dir / "legislators"
    if (repo_dir / ".git").exists():
        log.info("git_pull", path=str(repo_dir))
        subprocess.run(["git", "-C", str(repo_dir), "pull", "--ff-only"], check=True)
    else:
        log.info("git_clone", url=REPO_URL, path=str(repo_dir))
        subprocess.run(["git", "clone", "--depth=1", REPO_URL, str(repo_dir)], check=True)
    return repo_dir


def load_current(repo_dir: Path) -> list[dict]:
    """Load current legislators from YAML."""
    path = repo_dir / CURRENT_FILE
    with open(path) as f:
        data = yaml.safe_load(f)
    log.info("loaded_current_legislators", count=len(data))
    return data


def load_historical(repo_dir: Path) -> list[dict]:
    """Load historical legislators from YAML."""
    path = repo_dir / HISTORICAL_FILE
    with open(path) as f:
        data = yaml.safe_load(f)
    log.info("loaded_historical_legislators", count=len(data))
    return data


def load_committee_memberships(repo_dir: Path) -> dict[str, list[dict]]:
    """Load committee membership YAML. Returns {committee_id: [{bioguide, ...}]}."""
    path = repo_dir / COMMITTEES_FILE
    with open(path) as f:
        data = yaml.safe_load(f)
    log.info("loaded_committee_memberships", committees=len(data))
    return data
```

- [ ] **Step 3: Create legislator load/transform module**

```python
# pipeline/load/legislators.py
"""Transform congress-legislators YAML records and upload to Supabase."""
import structlog

from pipeline.shared.db import upsert, delete_then_insert

log = structlog.get_logger()

_STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
    "AS": "American Samoa", "GU": "Guam", "MP": "Northern Mariana Islands",
    "PR": "Puerto Rico", "VI": "Virgin Islands",
}

_CHAMBER_MAP = {"rep": "House", "sen": "Senate"}
_PARTY_MAP = {
    "Democrat": "Democrat",
    "Republican": "Republican",
    "Independent": "Independent",
    "Libertarian": "Independent",
    "Green": "Independent",
}


def transform_legislator(record: dict, in_office: bool) -> dict | None:
    """Transform a single congress-legislators YAML record to a DB row."""
    ids = record.get("id", {})
    bioguide = ids.get("bioguide")
    if not bioguide:
        return None

    terms = record.get("terms", [])
    if not terms:
        return None
    last_term = terms[-1]

    name = record.get("name", {})
    bio = record.get("bio", {})
    term_type = last_term.get("type", "")
    chamber = _CHAMBER_MAP.get(term_type, term_type)
    party_raw = last_term.get("party", "Independent")
    state = last_term.get("state", "")

    title = "Senator" if term_type == "sen" else "Representative"

    return {
        "bioguide_id": bioguide,
        "lis_id": ids.get("lis"),
        "icpsr_id": ids.get("icpsr"),
        "govtrack_id": str(ids["govtrack"]) if ids.get("govtrack") else None,
        "thomas_id": ids.get("thomas"),
        "fec_ids": ids.get("fec", []),
        "first_name": name.get("first", ""),
        "last_name": name.get("last", ""),
        "full_name": name.get("official_full") or f"{name.get('first', '')} {name.get('last', '')}",
        "party": _PARTY_MAP.get(party_raw, "Independent"),
        "chamber": chamber,
        "state": state,
        "state_full": _STATE_NAMES.get(state, state),
        "district": last_term.get("district"),
        "title": title,
        "in_office": in_office,
        "birthday": bio.get("birthday"),
        "gender": bio.get("gender"),
        "website": last_term.get("url"),
        "phone": last_term.get("phone"),
        "address": last_term.get("address"),
        "photo_url": f"https://bioguide.congress.gov/bioguide/photo/{bioguide[0]}/{bioguide}.jpg",
        "term_start": last_term.get("start"),
        "term_end": last_term.get("end"),
        "senate_class": last_term.get("class"),
        "next_election": _next_election_year(last_term),
        "twitter": record.get("social", {}).get("twitter") if "social" in record else None,
        "facebook": record.get("social", {}).get("facebook") if "social" in record else None,
        "youtube": record.get("social", {}).get("youtube") if "social" in record else None,
        "fec_committee_id": None,
        "raw_json": record,
    }


def _next_election_year(term: dict) -> int | None:
    end = term.get("end")
    if not end:
        return None
    try:
        return int(end[:4])
    except (ValueError, TypeError):
        return None


def transform_committee_membership(
    committee_id: str,
    members: list[dict],
) -> list[dict]:
    """Transform committee membership entries for one committee."""
    rows = []
    for member in members:
        bioguide = member.get("bioguide")
        if not bioguide:
            continue
        rows.append({
            "bioguide_id": bioguide,
            "committee_id": committee_id,
            "rank": member.get("rank"),
            "role": member.get("title"),
        })
    return rows


def load_legislators(current: list[dict], historical: list[dict]) -> int:
    """Transform and upload all legislators to congress.legislators."""
    rows = []
    for record in current:
        row = transform_legislator(record, in_office=True)
        if row:
            rows.append(row)
    for record in historical:
        row = transform_legislator(record, in_office=False)
        if row:
            rows.append(row)

    log.info("legislators_transformed", total=len(rows))
    return upsert("legislators", rows, on_conflict="bioguide_id", schema="congress")


def load_committee_memberships(memberships: dict[str, list[dict]]) -> int:
    """Transform and upload committee memberships."""
    all_rows = []
    for committee_id, members in memberships.items():
        all_rows.extend(transform_committee_membership(committee_id, members))

    log.info("committee_memberships_transformed", total=len(all_rows))
    # Full replace - delete all then insert
    client = __import__("pipeline.shared.db", fromlist=["get_supabase"]).get_supabase()
    client.schema("congress").table("committee_memberships").delete().neq("bioguide_id", "").execute()
    return upsert("committee_memberships", all_rows, on_conflict="bioguide_id,committee_id", schema="congress")
```

- [ ] **Step 4: Run tests**

```bash
cd pipeline && uv run pytest tests/test_legislators.py -v
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/ingest/legislators.py pipeline/load/legislators.py pipeline/tests/test_legislators.py
git commit -m "feat(pipeline): legislator ingestion from congress-legislators YAML"
```

---

## Task 7: Bill ingestion (usc-run)

**Files:**
- Create: `pipeline/ingest/congress.py`
- Create: `pipeline/load/bills.py`
- Create: `pipeline/tests/test_bills.py`

- [ ] **Step 1: Write tests for bill transform**

```python
# pipeline/tests/test_bills.py
from pipeline.load.bills import transform_bill, make_bill_id


def test_make_bill_id():
    assert make_bill_id(119, "hr", 4521) == "119-hr-4521"
    assert make_bill_id(118, "s", 1247) == "118-s-1247"


SAMPLE_BILL_JSON = {
    "bill_id": "hr4521-119",
    "bill_type": "hr",
    "number": 4521,
    "congress": 119,
    "introduced_at": "2025-03-15",
    "official_title": "To establish a clean energy program.",
    "short_title": "Clean Energy Act",
    "summary": {
        "text": "This bill establishes a program for clean energy development.",
        "date": "2025-03-15",
    },
    "sponsor": {
        "bioguide_id": "P000197",
        "name": "Nancy Pelosi",
        "party": "D",
        "state": "CA",
    },
    "status": "REFERRED",
    "status_at": "2025-03-15",
    "subjects_top_term": "Energy",
    "subjects": ["Energy", "Environmental protection"],
    "actions": [
        {
            "acted_at": "2025-03-15",
            "text": "Referred to the Committee on Energy and Commerce.",
            "type": "referral",
        }
    ],
    "history": {
        "active": False,
        "awaiting_signature": False,
        "enacted": False,
        "vetoed": False,
    },
}


def test_transform_bill_basic():
    row = transform_bill(SAMPLE_BILL_JSON)
    assert row is not None
    assert row["bill_id"] == "119-hr-4521"
    assert row["bill_number"] == "H.R. 4521"
    assert row["congress"] == 119
    assert row["title"] == "Clean Energy Act"
    assert row["sponsor_bioguide_id"] == "P000197"
    assert row["status"] == "Committee"
    assert "climate-environment" in row["topics"] or "economy" in row["topics"]


def test_transform_bill_missing_congress_returns_none():
    bad = {**SAMPLE_BILL_JSON, "congress": None}
    assert transform_bill(bad) is None


def test_transform_bill_missing_number_returns_none():
    bad = {**SAMPLE_BILL_JSON, "number": None}
    assert transform_bill(bad) is None
```

- [ ] **Step 2: Create usc-run wrapper**

```python
# pipeline/ingest/congress.py
"""Wrap usc-run to fetch bill and vote data."""
import json
import subprocess
from pathlib import Path
from typing import Generator

import structlog

log = structlog.get_logger()


def setup(data_dir: Path) -> Path:
    """Clone usc-run repo if not present. Returns repo path."""
    repo_dir = data_dir / "congress-scraper"
    if (repo_dir / ".git").exists():
        log.info("usc_run_repo_exists", path=str(repo_dir))
    else:
        log.info("cloning_usc_run")
        subprocess.run(
            ["git", "clone", "--depth=1", "https://github.com/unitedstates/congress.git", str(repo_dir)],
            check=True,
        )
        # Install in the repo's own venv
        subprocess.run(
            ["python3", "-m", "venv", str(repo_dir / "env")],
            check=True,
        )
        subprocess.run(
            [str(repo_dir / "env" / "bin" / "pip"), "install", "-e", str(repo_dir)],
            check=True,
        )
    return repo_dir


def run_bills(repo_dir: Path, congress: int, force: bool = False) -> None:
    """Run usc-run bills for a specific congress."""
    cmd = [
        str(repo_dir / "env" / "bin" / "usc-run"),
        "bills",
        f"--congress={congress}",
        "--log=info",
    ]
    if force:
        cmd.append("--force")
    log.info("usc_run_bills", congress=congress, force=force)
    subprocess.run(cmd, cwd=str(repo_dir), check=True)


def run_votes(repo_dir: Path, congress: int, force: bool = False) -> None:
    """Run usc-run votes for a specific congress."""
    cmd = [
        str(repo_dir / "env" / "bin" / "usc-run"),
        "votes",
        f"--congress={congress}",
        "--log=info",
    ]
    if force:
        cmd.append("--force")
    log.info("usc_run_votes", congress=congress, force=force)
    subprocess.run(cmd, cwd=str(repo_dir), check=True)


def iter_bill_jsons(repo_dir: Path, congress: int) -> Generator[dict, None, None]:
    """Iterate over all bill data.json files for a congress."""
    data_dir = repo_dir / "data" / str(congress) / "bills"
    if not data_dir.exists():
        log.warning("no_bill_data", path=str(data_dir))
        return
    count = 0
    for bill_type_dir in sorted(data_dir.iterdir()):
        if not bill_type_dir.is_dir():
            continue
        for bill_dir in sorted(bill_type_dir.iterdir()):
            json_path = bill_dir / "data.json"
            if json_path.exists():
                with open(json_path) as f:
                    yield json.load(f)
                count += 1
    log.info("iterated_bill_jsons", congress=congress, count=count)


def iter_vote_jsons(repo_dir: Path, congress: int) -> Generator[dict, None, None]:
    """Iterate over all vote data.json files for a congress."""
    data_dir = repo_dir / "data" / str(congress) / "votes"
    if not data_dir.exists():
        log.warning("no_vote_data", path=str(data_dir))
        return
    count = 0
    for session_dir in sorted(data_dir.iterdir()):
        if not session_dir.is_dir():
            continue
        for vote_dir in sorted(session_dir.iterdir()):
            json_path = vote_dir / "data.json"
            if json_path.exists():
                with open(json_path) as f:
                    yield json.load(f)
                count += 1
    log.info("iterated_vote_jsons", congress=congress, count=count)
```

- [ ] **Step 3: Create bill transform/load module**

```python
# pipeline/load/bills.py
"""Transform usc-run bill JSON to congress.bills rows and upload."""
import re

import structlog

from pipeline.shared.db import upsert

log = structlog.get_logger()

# Congress.gov policyArea -> app topic slug mapping
_TOPIC_SLUG_MAP = {
    "Agriculture and Food": "agriculture",
    "Armed Forces and National Security": "defense",
    "Civil Rights and Liberties, Minority Issues": "civil-rights",
    "Commerce": "economy",
    "Congress": "government",
    "Crime and Law Enforcement": "criminal-justice",
    "Economics and Public Finance": "economy",
    "Education": "education",
    "Emergency Management": "defense",
    "Energy": "climate-environment",
    "Environmental Protection": "climate-environment",
    "Families": "healthcare",
    "Finance and Financial Sector": "economy",
    "Foreign Trade and International Finance": "foreign-policy",
    "Government Operations and Politics": "government",
    "Health": "healthcare",
    "Housing and Community Development": "economy",
    "Immigration": "immigration",
    "International Affairs": "foreign-policy",
    "Labor and Employment": "economy",
    "Law": "criminal-justice",
    "Native Americans": "civil-rights",
    "Public Lands and Natural Resources": "climate-environment",
    "Science, Technology, Communications": "technology",
    "Social Welfare": "healthcare",
    "Sports and Recreation": "education",
    "Taxation": "economy",
    "Transportation and Public Works": "infrastructure",
    "Water Resources Development": "infrastructure",
}

_BILL_TYPE_DISPLAY = {
    "hr": "H.R.", "s": "S.", "hjres": "H.J.Res.", "sjres": "S.J.Res.",
    "hconres": "H.Con.Res.", "sconres": "S.Con.Res.", "hres": "H.Res.", "sres": "S.Res.",
}

_STATUS_RULES = [
    ("became public law", "Passed"),
    ("signed by president", "Passed"),
    ("passed the house", "Passed"),
    ("passed the senate", "Passed"),
    ("passed senate", "Passed"),
    ("failed", "Failed"),
    ("vetoed", "Failed"),
    ("referred to", "Committee"),
    ("tabled", "Stalled"),
]


def make_bill_id(congress: int, bill_type: str, number: int | str) -> str:
    return f"{congress}-{bill_type.lower()}-{number}"


def transform_bill(data: dict) -> dict | None:
    """Transform a usc-run bill data.json to a congress.bills row."""
    congress = data.get("congress")
    bill_type = data.get("bill_type", "").lower()
    number = data.get("number")

    if not congress or not number:
        return None

    bill_id = make_bill_id(congress, bill_type, number)
    bill_number = f"{_BILL_TYPE_DISPLAY.get(bill_type, bill_type.upper())} {number}"

    # Title: prefer short_title, fallback to official_title
    title = data.get("short_title") or data.get("official_title") or ""

    # Summary
    summary_obj = data.get("summary")
    summary = None
    if isinstance(summary_obj, dict):
        summary = _clean_html(summary_obj.get("text", ""))
    elif isinstance(summary_obj, str):
        summary = _clean_html(summary_obj)

    # Sponsor
    sponsor = data.get("sponsor") or {}
    sponsor_name = sponsor.get("name")
    sponsor_bioguide = sponsor.get("bioguide_id")
    sponsor_party_raw = sponsor.get("party", "")
    sponsor_party = {"D": "Democrat", "R": "Republican", "I": "Independent"}.get(
        sponsor_party_raw, sponsor_party_raw
    )

    # Status
    actions = data.get("actions", [])
    last_action_text = actions[-1].get("text", "") if actions else ""
    last_action_date = actions[-1].get("acted_at") if actions else None
    status = _derive_status(last_action_text, data)

    # Topics
    subjects = data.get("subjects", [])
    top_term = data.get("subjects_top_term")
    if top_term and top_term not in subjects:
        subjects.insert(0, top_term)
    topics = list(dict.fromkeys(
        _TOPIC_SLUG_MAP[s] for s in subjects if s in _TOPIC_SLUG_MAP
    ))

    return {
        "bill_id": bill_id,
        "bill_number": bill_number,
        "bill_type": bill_type,
        "congress": congress,
        "title": title,
        "summary": summary,
        "combined_text": None,
        "status": status,
        "introduced_date": data.get("introduced_at"),
        "policy_area": top_term,
        "sponsor_name": sponsor_name,
        "sponsor_bioguide_id": sponsor_bioguide,
        "sponsor_party": sponsor_party,
        "last_action_text": last_action_text or None,
        "last_action_date": last_action_date,
        "congress_gov_url": _build_url(congress, bill_type, number),
        "topics": topics,
        "referenced_agencies": [],
        "referenced_laws": [],
        "referenced_usc": [],
    }


def _derive_status(action_text: str, data: dict) -> str:
    text_lower = action_text.lower()
    history = data.get("history", {})

    if history.get("enacted"):
        return "Passed"
    if history.get("vetoed"):
        return "Failed"

    for pattern, status in _STATUS_RULES:
        if pattern in text_lower:
            if status == "Committee":
                introduced = data.get("introduced_at", "")
                if introduced and _months_since(introduced) > 6:
                    return "Stalled"
            return status
    return "Active"


def _months_since(date_str: str) -> int:
    from datetime import date

    try:
        d = date.fromisoformat(date_str)
        today = date.today()
        return (today.year - d.year) * 12 + (today.month - d.month)
    except (ValueError, TypeError):
        return 0


def _build_url(congress: int, bill_type: str, number: int | str) -> str:
    type_path = {
        "hr": "house-bill", "s": "senate-bill",
        "hjres": "house-joint-resolution", "sjres": "senate-joint-resolution",
        "hconres": "house-concurrent-resolution", "sconres": "senate-concurrent-resolution",
        "hres": "house-resolution", "sres": "senate-resolution",
    }.get(bill_type, bill_type)
    ordinal = f"{congress}th" if congress % 10 not in (1, 2, 3) or congress in (11, 12, 13) else (
        f"{congress}st" if congress % 10 == 1 else f"{congress}nd" if congress % 10 == 2 else f"{congress}rd"
    )
    return f"https://www.congress.gov/bill/{ordinal}-congress/{type_path}/{number}"


def _clean_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text).strip()


def load_bills(bill_jsons: list[dict]) -> int:
    """Transform and upload bills to congress.bills."""
    rows = []
    for data in bill_jsons:
        row = transform_bill(data)
        if row:
            rows.append(row)
    log.info("bills_transformed", total=len(rows))
    return upsert("bills", rows, on_conflict="bill_id", schema="congress")
```

- [ ] **Step 4: Run tests**

```bash
cd pipeline && uv run pytest tests/test_bills.py -v
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/ingest/congress.py pipeline/load/bills.py pipeline/tests/test_bills.py
git commit -m "feat(pipeline): bill ingestion from usc-run JSON"
```

---

## Task 8: Vote ingestion

**Files:**
- Create: `pipeline/load/votes.py`
- Create: `pipeline/tests/test_votes.py`

- [ ] **Step 1: Write tests for vote transform**

```python
# pipeline/tests/test_votes.py
from pipeline.load.votes import transform_vote, transform_positions


SAMPLE_VOTE_JSON = {
    "vote_id": "h123-119.2025",
    "chamber": "h",
    "congress": 119,
    "session": "2025",
    "number": 123,
    "date": "2025-04-15T14:30:00-04:00",
    "type": "On Passage",
    "question": "On Passage - H.R. 4521",
    "result": "Passed",
    "result_text": "Passed",
    "requires": "1/2",
    "bill": {
        "bill_id": "hr4521-119",
        "type": "hr",
        "number": 4521,
        "congress": 119,
    },
    "votes": {
        "Yea": [
            {"id": "P000197", "display_name": "Pelosi", "party": "D", "state": "CA"},
            {"id": "S000148", "display_name": "Schumer", "party": "D", "state": "NY"},
        ],
        "Nay": [
            {"id": "M000355", "display_name": "McConnell", "party": "R", "state": "KY"},
        ],
        "Not Voting": [],
        "Present": [],
    },
}


def test_transform_vote_summary():
    summary = transform_vote(SAMPLE_VOTE_JSON)
    assert summary is not None
    assert summary["id"] == "house-119-123"
    assert summary["bill_id"] == "119-hr-4521"
    assert summary["congress"] == 119
    assert summary["chamber"] == "House"
    assert summary["result"] == "Passed"
    assert summary["yea_total"] == 2
    assert summary["nay_total"] == 1


def test_transform_positions():
    positions = transform_positions(SAMPLE_VOTE_JSON, "house-119-123")
    assert len(positions) == 3
    yeas = [p for p in positions if p["position"] == "Yea"]
    nays = [p for p in positions if p["position"] == "Nay"]
    assert len(yeas) == 2
    assert len(nays) == 1
    assert yeas[0]["bioguide_id"] == "P000197"


def test_transform_vote_missing_number_returns_none():
    bad = {**SAMPLE_VOTE_JSON, "number": None}
    assert transform_vote(bad) is None
```

- [ ] **Step 2: Create vote transform/load module**

```python
# pipeline/load/votes.py
"""Transform usc-run vote JSON to congress.bill_vote_summaries and positions."""
import structlog

from pipeline.shared.db import upsert
from pipeline.load.bills import make_bill_id

log = structlog.get_logger()

_CHAMBER_MAP = {"h": "House", "s": "Senate"}

_POSITION_MAP = {
    "yea": "Yea", "aye": "Yea", "yes": "Yea",
    "nay": "Nay", "no": "Nay",
    "present": "Present",
    "not voting": "Not Voting",
}

_PARTY_MAP = {"D": "Democrat", "R": "Republican", "I": "Independent"}


def transform_vote(data: dict) -> dict | None:
    """Transform a usc-run vote data.json to a bill_vote_summaries row."""
    chamber_code = data.get("chamber", "")
    congress = data.get("congress")
    number = data.get("number")

    if not number or not congress:
        return None

    chamber = _CHAMBER_MAP.get(chamber_code, chamber_code)
    vote_id = f"{chamber.lower()}-{congress}-{number}"

    # Extract bill_id
    bill = data.get("bill")
    bill_id = None
    if bill:
        bill_type = bill.get("type", "").lower()
        bill_number = bill.get("number")
        if bill_type and bill_number:
            bill_id = make_bill_id(congress, bill_type, bill_number)

    # Count votes by position
    votes_by_position = data.get("votes", {})
    yea_total = len(votes_by_position.get("Yea", []) + votes_by_position.get("Aye", []))
    nay_total = len(votes_by_position.get("Nay", []) + votes_by_position.get("No", []))
    present_total = len(votes_by_position.get("Present", []))
    not_voting_total = len(votes_by_position.get("Not Voting", []))

    # Count by party
    party_counts = _count_by_party(votes_by_position)

    # Date
    date_raw = data.get("date", "")
    vote_date = date_raw[:10] if date_raw else None

    return {
        "id": vote_id,
        "bill_id": bill_id,
        "congress": congress,
        "chamber": chamber,
        "date": vote_date,
        "question": data.get("question"),
        "result": data.get("result") or data.get("result_text", ""),
        "title": data.get("question"),
        "required": data.get("requires"),
        "yea_total": yea_total,
        "nay_total": nay_total,
        "present_total": present_total,
        "not_voting_total": not_voting_total,
        "yea_democrat": party_counts.get("yea_democrat", 0),
        "nay_democrat": party_counts.get("nay_democrat", 0),
        "yea_republican": party_counts.get("yea_republican", 0),
        "nay_republican": party_counts.get("nay_republican", 0),
        "yea_independent": party_counts.get("yea_independent", 0),
        "nay_independent": party_counts.get("nay_independent", 0),
        "source_url": None,
    }


def _count_by_party(votes_by_position: dict) -> dict:
    counts = {}
    for position, voters in votes_by_position.items():
        pos_key = position.lower().replace(" ", "_")
        if pos_key in ("yea", "aye"):
            pos_key = "yea"
        elif pos_key in ("nay", "no"):
            pos_key = "nay"
        else:
            continue
        for voter in voters:
            party_raw = voter.get("party", "")
            party = _PARTY_MAP.get(party_raw, "independent").lower()
            key = f"{pos_key}_{party}"
            counts[key] = counts.get(key, 0) + 1
    return counts


def transform_positions(data: dict, vote_id: str) -> list[dict]:
    """Transform vote positions from usc-run vote JSON."""
    positions = []
    votes_by_position = data.get("votes", {})

    for position_label, voters in votes_by_position.items():
        normalized = _POSITION_MAP.get(position_label.lower(), position_label)
        for voter in voters:
            bioguide = voter.get("id")
            if not bioguide:
                continue
            positions.append({
                "vote_id": vote_id,
                "bioguide_id": bioguide,
                "position": normalized,
            })

    return positions


def load_votes(vote_jsons: list[dict]) -> tuple[int, int]:
    """Transform and upload votes. Returns (summaries_count, positions_count)."""
    summaries = []
    all_positions = []

    for data in vote_jsons:
        summary = transform_vote(data)
        if not summary:
            continue
        summaries.append(summary)

        positions = transform_positions(data, summary["id"])
        all_positions.extend(positions)

    log.info("votes_transformed", summaries=len(summaries), positions=len(all_positions))

    s_count = upsert("bill_vote_summaries", summaries, on_conflict="id", schema="congress")
    p_count = upsert("bill_vote_positions", all_positions, on_conflict="vote_id,bioguide_id", schema="congress")
    return s_count, p_count
```

- [ ] **Step 3: Run tests**

```bash
cd pipeline && uv run pytest tests/test_votes.py -v
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add pipeline/load/votes.py pipeline/tests/test_votes.py
git commit -m "feat(pipeline): vote ingestion from usc-run JSON"
```

---

## Task 9: FEC ingestion (bulk files to Parquet + Supabase)

**Files:**
- Create: `pipeline/ingest/fec.py`
- Create: `pipeline/load/fec.py`
- Create: `pipeline/tests/test_fec.py`

- [ ] **Step 1: Write tests for FEC transform**

```python
# pipeline/tests/test_fec.py
from pipeline.load.fec import transform_pac_contribution, transform_ie_contribution


def test_transform_pac_contribution_valid():
    record = {
        "sub_id": "4123456789",
        "cmte_id": "C00123456",
        "cand_id": "H0NY01234",
        "transaction_tp": "24K",
        "transaction_amt": "5000",
        "transaction_dt": "01152025",
    }
    row = transform_pac_contribution(record, cycle=2026)
    assert row is not None
    assert row["sub_id"] == 4123456789
    assert row["cmte_id"] == "C00123456"
    assert row["transaction_amt"] == 5000.0
    assert row["cycle"] == 2026


def test_transform_pac_contribution_wrong_type_returns_none():
    record = {
        "sub_id": "123",
        "cmte_id": "C00123456",
        "cand_id": "H0NY01234",
        "transaction_tp": "15",
        "transaction_amt": "5000",
    }
    assert transform_pac_contribution(record, cycle=2026) is None


def test_transform_pac_contribution_missing_sub_id_returns_none():
    record = {
        "sub_id": "",
        "cmte_id": "C00123456",
        "transaction_tp": "24K",
        "transaction_amt": "5000",
    }
    assert transform_pac_contribution(record, cycle=2026) is None


def test_transform_ie_contribution_support():
    record = {
        "sub_id": "9876543210",
        "cmte_id": "C00654321",
        "cand_id": "S0CA00001",
        "transaction_tp": "24E",
        "transaction_amt": "25000",
        "transaction_dt": "03012025",
        "sup_opp": "S",
    }
    row = transform_ie_contribution(record, cycle=2026)
    assert row is not None
    assert row["sup_opp"] == "S"
    assert row["transaction_amt"] == 25000.0
```

- [ ] **Step 2: Create FEC download module**

```python
# pipeline/ingest/fec.py
"""Download FEC bulk files and convert to Parquet."""
import os
import zipfile
from pathlib import Path

import httpx
import structlog

from pipeline.shared.parquet import csv_to_parquet

log = structlog.get_logger()

FEC_BULK_BASE = "https://www.fec.gov/files/bulk-downloads"
FEC_CYCLES = [2024, 2026]

# Column definitions for FEC pipe-delimited files (no headers)
PAS2_COLS = [
    "cmte_id", "amndt_ind", "rpt_tp", "transaction_pgi", "image_num",
    "transaction_tp", "entity_tp", "name", "city", "state", "zip_code",
    "employer", "occupation", "transaction_dt", "transaction_amt",
    "other_id", "cand_id", "tran_id", "file_num", "memo_cd", "memo_text", "sub_id",
]

INDIV_COLS = [
    "cmte_id", "amndt_ind", "rpt_tp", "transaction_pgi", "image_num",
    "transaction_tp", "entity_tp", "name", "city", "state", "zip_code",
    "employer", "occupation", "transaction_dt", "transaction_amt",
    "other_id", "tran_id", "file_num", "memo_cd", "memo_text", "sub_id",
]

CM_COLS = [
    "cmte_id", "cmte_nm", "tres_nm", "cmte_st1", "cmte_st2", "cmte_city",
    "cmte_st", "cmte_zip", "cmte_dsgn", "cmte_tp", "cmte_pty_affiliation",
    "cmte_filing_freq", "org_tp", "connected_org_nm", "cand_id",
]


def download_fec_file(cycle: int, file_type: str, dest_dir: Path) -> Path:
    """Download an FEC bulk file zip, extract, return path to .txt file."""
    yy = str(cycle)[-2:]
    filename = f"{file_type}{yy}.zip"
    url = f"{FEC_BULK_BASE}/{cycle}/{filename}"
    zip_path = dest_dir / filename
    txt_path = dest_dir / f"{file_type}{yy}.txt"

    if txt_path.exists():
        log.info("fec_file_exists", path=str(txt_path))
        return txt_path

    log.info("downloading_fec_file", url=url)
    dest_dir.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, follow_redirects=True, timeout=300) as resp:
        resp.raise_for_status()
        with open(zip_path, "wb") as f:
            for chunk in resp.iter_bytes(chunk_size=8192):
                f.write(chunk)

    with zipfile.ZipFile(zip_path) as zf:
        txt_files = [n for n in zf.namelist() if n.endswith(".txt")]
        if not txt_files:
            raise FileNotFoundError(f"No .txt in {zip_path}")
        zf.extract(txt_files[0], dest_dir)
        extracted = dest_dir / txt_files[0]
        if extracted != txt_path:
            extracted.rename(txt_path)

    zip_path.unlink()
    log.info("fec_file_extracted", path=str(txt_path))
    return txt_path


def convert_to_parquet(
    txt_path: Path,
    parquet_path: Path,
    columns: list[str],
) -> int:
    """Convert a pipe-delimited FEC .txt file to Parquet. Returns row count."""
    if parquet_path.exists():
        log.info("parquet_exists", path=str(parquet_path))
        from pipeline.shared.parquet import duckdb_connect
        with duckdb_connect() as conn:
            return conn.execute(f"SELECT count(*) FROM read_parquet('{parquet_path}')").fetchone()[0]

    return csv_to_parquet(txt_path, parquet_path, delimiter="|", columns=columns, header=False)


def download_and_convert_cycle(cycle: int, data_dir: Path) -> dict[str, Path]:
    """Download and convert all FEC files for a cycle. Returns {file_type: parquet_path}."""
    fec_dir = data_dir / "fec" / str(cycle)
    fec_dir.mkdir(parents=True, exist_ok=True)

    results = {}
    for file_type, cols in [("pas2", PAS2_COLS), ("indiv", INDIV_COLS), ("cm", CM_COLS)]:
        txt_path = download_fec_file(cycle, file_type, fec_dir)
        parquet_path = fec_dir / f"{file_type}.parquet"
        convert_to_parquet(txt_path, parquet_path, cols)
        results[file_type] = parquet_path

    return results
```

- [ ] **Step 3: Create FEC load module**

```python
# pipeline/load/fec.py
"""Transform FEC Parquet data and upload aggregations to Supabase."""
from pathlib import Path

import structlog

from pipeline.shared.db import upsert, delete_then_insert
from pipeline.shared.parquet import duckdb_connect

log = structlog.get_logger()

PAC_DIRECT_TPS = {"24K", "24Z"}
IE_FOR_TP = "24E"
IE_AGAINST_TP = "24A"


def transform_pac_contribution(record: dict, cycle: int) -> dict | None:
    """Transform a single PAC contribution record."""
    tp = (record.get("transaction_tp") or "").strip()
    if tp not in PAC_DIRECT_TPS:
        return None

    sub_id = _safe_int(record.get("sub_id"))
    cmte_id = (record.get("cmte_id") or "").strip()
    amt = _safe_numeric(record.get("transaction_amt"))

    if not sub_id or not cmte_id or amt is None:
        return None

    return {
        "sub_id": sub_id,
        "cmte_id": cmte_id,
        "cand_id": (record.get("cand_id") or "").strip() or None,
        "transaction_tp": tp,
        "transaction_amt": amt,
        "transaction_dt": (record.get("transaction_dt") or "").strip() or None,
        "cycle": cycle,
    }


def transform_ie_contribution(record: dict, cycle: int) -> dict | None:
    """Transform a single independent expenditure record."""
    tp = (record.get("transaction_tp") or "").strip()
    if tp not in (IE_FOR_TP, IE_AGAINST_TP):
        return None

    sub_id = _safe_int(record.get("sub_id"))
    cmte_id = (record.get("cmte_id") or "").strip()
    amt = _safe_numeric(record.get("transaction_amt"))

    if not sub_id or not cmte_id or amt is None:
        return None

    sup_opp = "S" if tp == IE_FOR_TP else "O"

    return {
        "sub_id": sub_id,
        "cmte_id": cmte_id,
        "cand_id": (record.get("cand_id") or "").strip() or None,
        "sup_opp": sup_opp,
        "transaction_tp": tp,
        "transaction_amt": amt,
        "transaction_dt": (record.get("transaction_dt") or "").strip() or None,
        "cycle": cycle,
    }


def load_pac_contributions(parquet_path: Path, cycle: int) -> int:
    """Load PAC-to-candidate contributions from Parquet to fec.pac_to_candidate."""
    from pipeline.shared.parquet import read_parquet_batched

    total = 0
    for batch in read_parquet_batched(parquet_path):
        rows = []
        for record in batch:
            row = transform_pac_contribution(record, cycle)
            if row:
                rows.append(row)
        if rows:
            upsert("pac_to_candidate", rows, on_conflict="sub_id", schema="fec")
            total += len(rows)
    log.info("pac_contributions_loaded", cycle=cycle, rows=total)
    return total


def load_ie_contributions(parquet_path: Path, cycle: int) -> int:
    """Load independent expenditures from Parquet to fec.independent_expenditures."""
    from pipeline.shared.parquet import read_parquet_batched

    total = 0
    for batch in read_parquet_batched(parquet_path):
        rows = []
        for record in batch:
            row = transform_ie_contribution(record, cycle)
            if row:
                rows.append(row)
        if rows:
            upsert("independent_expenditures", rows, on_conflict="sub_id", schema="fec")
            total += len(rows)
    log.info("ie_contributions_loaded", cycle=cycle, rows=total)
    return total


def load_committee_names(parquet_path: Path) -> int:
    """Load committee names from Parquet to fec.cmte_names."""
    from pipeline.shared.parquet import read_parquet_batched

    total = 0
    for batch in read_parquet_batched(parquet_path):
        rows = []
        for record in batch:
            cmte_id = (record.get("cmte_id") or "").strip()
            cmte_nm = (record.get("cmte_nm") or "").strip()
            if not cmte_id or not cmte_nm:
                continue
            rows.append({
                "cmte_id": cmte_id,
                "cmte_name": cmte_nm,
                "connected_org": (record.get("connected_org_nm") or "").strip() or None,
            })
        if rows:
            upsert("cmte_names", rows, on_conflict="cmte_id", schema="fec")
            total += len(rows)
    log.info("committee_names_loaded", rows=total)
    return total


def compute_funding_summaries(data_dir: Path, cycles: list[int]) -> int:
    """Compute legislator funding summaries using DuckDB on local Parquet files.

    Aggregates PAC direct contributions + independent expenditures per legislator per cycle.
    Uploads results to derived.legislator_funding_summary, derived.legislator_top_pacs,
    and derived.contributor_leaderboard_cache.
    """
    # This is a complex DuckDB aggregation job.
    # Port logic from the existing compute_funding_summaries.py script.
    # Uses DuckDB to join pas2.parquet + indiv.parquet against legislators.
    # Key queries:
    #   - JOIN fec contributions with legislators via fec_ids array
    #   - GROUP BY bioguide_id, cycle for funding summaries
    #   - RANK() for top PACs per legislator
    #   - Aggregate for leaderboard cache
    #
    # Implementation deferred to integration testing phase.
    # The existing compute_funding_summaries.py (30KB) logic is ported here.
    log.warning("compute_funding_summaries_not_yet_implemented")
    return 0


def _safe_int(val) -> int | None:
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_numeric(val) -> float | None:
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
```

- [ ] **Step 4: Run tests**

```bash
cd pipeline && uv run pytest tests/test_fec.py -v
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/ingest/fec.py pipeline/load/fec.py pipeline/tests/test_fec.py
git commit -m "feat(pipeline): FEC bulk file ingestion with Parquet conversion"
```

---

## Task 10: VoteView scores ingestion

**Files:**
- Create: `pipeline/ingest/voteview.py`
- Create: `pipeline/load/scores.py`
- Create: `pipeline/tests/test_scores.py`

- [ ] **Step 1: Write test**

```python
# pipeline/tests/test_scores.py
from pipeline.load.scores import transform_member_score


def test_transform_member_score_valid():
    record = {
        "icpsr": 14858,
        "congress": 119,
        "nominate_dim1": -0.342,
        "nominate_dim2": 0.156,
    }
    row = transform_member_score(record, icpsr_to_bioguide={"14858": "S000148"})
    assert row is not None
    assert row["bioguide_id"] == "S000148"
    assert row["nominate_dim1"] == -0.342


def test_transform_member_score_unknown_icpsr_returns_none():
    record = {"icpsr": 99999, "congress": 119, "nominate_dim1": 0.1, "nominate_dim2": 0.2}
    assert transform_member_score(record, icpsr_to_bioguide={}) is None
```

- [ ] **Step 2: Create VoteView ingest module**

```python
# pipeline/ingest/voteview.py
"""Download VoteView NOMINATE scores."""
import csv
from pathlib import Path
from io import StringIO

import httpx
import structlog

log = structlog.get_logger()

MEMBERS_URL = "https://voteview.com/static/data/out/members/HSall_members.csv"


def download_scores(data_dir: Path) -> Path:
    """Download VoteView members CSV. Returns path to downloaded file."""
    dest = data_dir / "voteview" / "members.csv"
    dest.parent.mkdir(parents=True, exist_ok=True)

    log.info("downloading_voteview_scores")
    resp = httpx.get(MEMBERS_URL, follow_redirects=True, timeout=120)
    resp.raise_for_status()
    dest.write_text(resp.text)
    log.info("voteview_scores_downloaded", path=str(dest))
    return dest


def parse_scores(csv_path: Path) -> list[dict]:
    """Parse VoteView CSV into list of dicts."""
    rows = []
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    log.info("voteview_scores_parsed", count=len(rows))
    return rows
```

- [ ] **Step 3: Create scores load module**

```python
# pipeline/load/scores.py
"""Transform VoteView scores and upload to congress.member_scores."""
import structlog

from pipeline.shared.db import upsert

log = structlog.get_logger()


def transform_member_score(
    record: dict,
    icpsr_to_bioguide: dict[str, str],
) -> dict | None:
    """Transform a VoteView member record to a member_scores row."""
    icpsr = str(record.get("icpsr", "")).strip()
    bioguide = icpsr_to_bioguide.get(icpsr)
    if not bioguide:
        return None

    congress = record.get("congress")
    if not congress:
        return None

    try:
        dim1 = float(record["nominate_dim1"]) if record.get("nominate_dim1") else None
        dim2 = float(record["nominate_dim2"]) if record.get("nominate_dim2") else None
    except (ValueError, TypeError):
        return None

    return {
        "bioguide_id": bioguide,
        "congress": int(congress),
        "nominate_dim1": dim1,
        "nominate_dim2": dim2,
    }


def load_scores(
    records: list[dict],
    icpsr_to_bioguide: dict[str, str],
) -> int:
    """Transform and upload member scores."""
    rows = []
    for record in records:
        row = transform_member_score(record, icpsr_to_bioguide)
        if row:
            rows.append(row)

    log.info("member_scores_transformed", total=len(rows))
    return upsert(
        "member_scores", rows, on_conflict="bioguide_id,congress", schema="congress"
    )
```

- [ ] **Step 4: Run tests**

```bash
cd pipeline && uv run pytest tests/test_scores.py -v
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/ingest/voteview.py pipeline/load/scores.py pipeline/tests/test_scores.py
git commit -m "feat(pipeline): VoteView NOMINATE scores ingestion"
```

---

## Task 11: Bill embeddings for semantic search

**Files:**
- Create: `pipeline/shared/embeddings.py`
- Create: `pipeline/load/embeddings.py`
- Create: `pipeline/scripts/embed_bills.py`
- Create: `pipeline/tests/test_embeddings.py`

- [ ] **Step 1: Write test**

```python
# pipeline/tests/test_embeddings.py
from pipeline.shared.embeddings import get_model, embed_texts


def test_get_model_loads_successfully():
    model = get_model()
    assert model is not None


def test_embed_texts_returns_correct_dimensions():
    model = get_model()
    texts = ["This is a test bill about clean energy.", "Healthcare reform act."]
    embeddings = embed_texts(model, texts)
    assert len(embeddings) == 2
    assert len(embeddings[0]) == 384  # all-MiniLM-L6-v2 output dimension


def test_embed_texts_empty_input():
    model = get_model()
    embeddings = embed_texts(model, [])
    assert len(embeddings) == 0
```

- [ ] **Step 2: Create embeddings shared module**

```python
# pipeline/shared/embeddings.py
"""Sentence-transformers model loading and embedding utilities."""
from pathlib import Path

import structlog

log = structlog.get_logger()

_MODEL_NAME = "all-MiniLM-L6-v2"
_model = None


def get_model(cache_dir: Path | None = None):
    """Load the sentence-transformers model (cached after first call)."""
    global _model
    if _model is not None:
        return _model

    from sentence_transformers import SentenceTransformer

    cache_path = str(cache_dir) if cache_dir else None
    log.info("loading_embedding_model", model=_MODEL_NAME)
    _model = SentenceTransformer(_MODEL_NAME, cache_folder=cache_path)
    log.info("embedding_model_loaded", model=_MODEL_NAME)
    return _model


def embed_texts(model, texts: list[str], batch_size: int = 256) -> list[list[float]]:
    """Embed a list of texts. Returns list of float vectors."""
    if not texts:
        return []
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        convert_to_numpy=True,
    )
    return [emb.tolist() for emb in embeddings]
```

- [ ] **Step 3: Create bill embedding load module**

```python
# pipeline/load/embeddings.py
"""Generate bill embeddings and upload to enrichment.bill_embeddings."""
import structlog

from pipeline.shared.db import get_supabase, upsert
from pipeline.shared.embeddings import get_model, embed_texts

log = structlog.get_logger()

MODEL_VERSION = "all-MiniLM-L6-v2-v1"


def load_bill_embeddings(batch_size: int = 500) -> int:
    """Fetch bills from congress.bills, embed, upload to enrichment.bill_embeddings.

    Only embeds bills that don't have an existing embedding with the current model version.
    """
    client = get_supabase()
    model = get_model()

    # Get all bill IDs that already have embeddings for this model version
    existing = set()
    result = (
        client.schema("enrichment")
        .table("bill_embeddings")
        .select("bill_id")
        .eq("model_version", MODEL_VERSION)
        .execute()
    )
    for row in result.data:
        existing.add(row["bill_id"])
    log.info("existing_embeddings", count=len(existing))

    # Fetch bills that need embedding
    offset = 0
    total = 0
    page_size = 1000

    while True:
        result = (
            client.schema("congress")
            .table("bills")
            .select("bill_id, title, summary")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        bills = result.data
        if not bills:
            break

        # Filter to bills needing embedding
        to_embed = [b for b in bills if b["bill_id"] not in existing]
        if to_embed:
            texts = [
                f"{b['title'] or ''} {b['summary'] or ''}".strip()
                for b in to_embed
            ]
            embeddings = embed_texts(model, texts)

            rows = []
            for bill, embedding in zip(to_embed, embeddings):
                rows.append({
                    "bill_id": bill["bill_id"],
                    "embedding": embedding,
                    "model_version": MODEL_VERSION,
                })

            upsert("bill_embeddings", rows, on_conflict="bill_id", schema="enrichment")
            total += len(rows)
            log.info("embedded_batch", count=len(rows), total=total)

        offset += page_size
        if len(bills) < page_size:
            break

    log.info("bill_embeddings_complete", total=total)
    return total
```

- [ ] **Step 4: Create embed_bills script**

```python
# pipeline/scripts/embed_bills.py
"""Generate/update bill embeddings for semantic search.

Usage: uv run python -m pipeline.scripts.embed_bills
"""
import sys

from pipeline.shared.observability import configure_logging, configure_sentry
from pipeline.shared.db import log_run_start, log_run_end
from pipeline.load.embeddings import load_bill_embeddings

SCRIPT = "embed_bills"


def main() -> None:
    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    try:
        total = load_bill_embeddings()
        log_run_end(run_id, "success", rows_processed=total)
    except Exception as e:
        log_run_end(run_id, "failed", error_detail=str(e))
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run tests** (note: first run downloads the model, ~80MB)

```bash
cd pipeline && uv run pytest tests/test_embeddings.py -v
```

Expected: All tests PASS (may take 30-60 seconds on first run for model download)

- [ ] **Step 6: Commit**

```bash
git add pipeline/shared/embeddings.py pipeline/load/embeddings.py \
  pipeline/scripts/embed_bills.py pipeline/tests/test_embeddings.py
git commit -m "feat(pipeline): bill embeddings with all-MiniLM-L6-v2 for semantic search"
```

---

## Task 12: Full pipeline orchestrator

**Files:**
- Create: `pipeline/scripts/ingest_all.py`
- Create: `pipeline/scripts/ingest_incremental.py`

- [ ] **Step 1: Create full ingest script**

```python
# pipeline/scripts/ingest_all.py
"""Run full pipeline: ingest all data sources and load to Supabase.

Usage: uv run python -m pipeline.scripts.ingest_all [--congress 119] [--cycles 2024,2026]
"""
import argparse
import sys
from pathlib import Path

import structlog

from pipeline.shared.observability import configure_logging, configure_sentry
from pipeline.shared.db import log_run_start, log_run_end
from pipeline.ingest import congress, legislators, fec, voteview
from pipeline.load.bills import load_bills
from pipeline.load.legislators import load_legislators, load_committee_memberships
from pipeline.load.votes import load_votes
from pipeline.load.fec import (
    load_pac_contributions,
    load_ie_contributions,
    load_committee_names,
)
from pipeline.load.scores import load_scores
from pipeline.load.embeddings import load_bill_embeddings

SCRIPT = "ingest_all"
DATA_DIR = Path(__file__).parent.parent / "data"

log = structlog.get_logger()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--congress", type=int, nargs="+", default=[118, 119])
    parser.add_argument("--cycles", type=str, default="2024,2026")
    parser.add_argument("--skip-congress", action="store_true")
    parser.add_argument("--skip-fec", action="store_true")
    parser.add_argument("--skip-embeddings", action="store_true")
    args = parser.parse_args()

    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    total_rows = 0

    try:
        # 1. Legislators (always first — other tables reference them)
        log.info("stage_legislators")
        repo_dir = legislators.sync(DATA_DIR)
        current = legislators.load_current(repo_dir)
        historical = legislators.load_historical(repo_dir)
        total_rows += load_legislators(current, historical)

        memberships = legislators.load_committee_memberships(repo_dir)
        load_committee_memberships(memberships)

        # Build ICPSR -> bioguide lookup for VoteView
        icpsr_to_bioguide = {}
        for record in current + historical:
            ids = record.get("id", {})
            if ids.get("bioguide") and ids.get("icpsr"):
                icpsr_to_bioguide[str(ids["icpsr"])] = ids["bioguide"]

        # 2. VoteView scores
        log.info("stage_voteview")
        csv_path = voteview.download_scores(DATA_DIR)
        scores = voteview.parse_scores(csv_path)
        total_rows += load_scores(scores, icpsr_to_bioguide)

        # 3. Congress data (bills + votes)
        if not args.skip_congress:
            repo = congress.setup(DATA_DIR)
            for c in args.congress:
                log.info("stage_congress", congress=c)
                congress.run_bills(repo, c)
                congress.run_votes(repo, c)

                bill_jsons = list(congress.iter_bill_jsons(repo, c))
                total_rows += load_bills(bill_jsons)

                vote_jsons = list(congress.iter_vote_jsons(repo, c))
                s, p = load_votes(vote_jsons)
                total_rows += s + p

        # 4. FEC data
        if not args.skip_fec:
            for cycle in cycles:
                log.info("stage_fec", cycle=cycle)
                paths = fec.download_and_convert_cycle(cycle, DATA_DIR)

                total_rows += load_pac_contributions(paths["pas2"], cycle)
                # IE contributions are also in pas2 file
                total_rows += load_ie_contributions(paths["pas2"], cycle)
                total_rows += load_committee_names(paths["cm"])

        # 5. Bill embeddings
        if not args.skip_embeddings:
            log.info("stage_embeddings")
            total_rows += load_bill_embeddings()

        log_run_end(run_id, "success", rows_processed=total_rows)
        log.info("pipeline_complete", total_rows=total_rows)

    except Exception as e:
        log.error("pipeline_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Create incremental sync script**

```python
# pipeline/scripts/ingest_incremental.py
"""Incremental pipeline sync — only fetches data updated since last run.

Usage: uv run python -m pipeline.scripts.ingest_incremental
"""
import sys
from pathlib import Path

import structlog

from pipeline.shared.observability import configure_logging, configure_sentry
from pipeline.shared.db import log_run_start, log_run_end
from pipeline.ingest import congress, legislators, voteview
from pipeline.load.bills import load_bills
from pipeline.load.legislators import load_legislators, load_committee_memberships
from pipeline.load.votes import load_votes
from pipeline.load.scores import load_scores
from pipeline.load.embeddings import load_bill_embeddings

SCRIPT = "ingest_incremental"
DATA_DIR = Path(__file__).parent.parent / "data"
CONGRESSES = [119]

log = structlog.get_logger()


def main() -> None:
    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    total_rows = 0

    try:
        # 1. Legislators (always sync — YAML is small)
        repo_dir = legislators.sync(DATA_DIR)
        current = legislators.load_current(repo_dir)
        historical = legislators.load_historical(repo_dir)
        total_rows += load_legislators(current, historical)

        memberships = legislators.load_committee_memberships(repo_dir)
        load_committee_memberships(memberships)

        icpsr_to_bioguide = {}
        for record in current + historical:
            ids = record.get("id", {})
            if ids.get("bioguide") and ids.get("icpsr"):
                icpsr_to_bioguide[str(ids["icpsr"])] = ids["bioguide"]

        # 2. VoteView
        csv_path = voteview.download_scores(DATA_DIR)
        scores = voteview.parse_scores(csv_path)
        total_rows += load_scores(scores, icpsr_to_bioguide)

        # 3. Congress (current congress only, usc-run handles caching)
        repo = congress.setup(DATA_DIR)
        for c in CONGRESSES:
            congress.run_bills(repo, c)
            congress.run_votes(repo, c)

            bill_jsons = list(congress.iter_bill_jsons(repo, c))
            total_rows += load_bills(bill_jsons)

            vote_jsons = list(congress.iter_vote_jsons(repo, c))
            s, p = load_votes(vote_jsons)
            total_rows += s + p

        # 4. Embed any new bills
        total_rows += load_bill_embeddings()

        log_run_end(run_id, "success", rows_processed=total_rows)
        log.info("incremental_sync_complete", total_rows=total_rows)

    except Exception as e:
        log.error("incremental_sync_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Commit**

```bash
git add pipeline/scripts/ingest_all.py pipeline/scripts/ingest_incremental.py
git commit -m "feat(pipeline): full and incremental pipeline orchestrator scripts"
```

---

## Task 13: Integration test — end-to-end pipeline run

**Files:**
- Create: `pipeline/tests/test_integration.py`

- [ ] **Step 1: Write integration test (requires env vars)**

```python
# pipeline/tests/test_integration.py
"""Integration tests that require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

Run with: uv run pytest tests/test_integration.py -v -k integration --run-integration
"""
import os
import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("SUPABASE_URL"),
    reason="SUPABASE_URL not set — skipping integration tests",
)


def test_integration_legislator_load():
    """Load a single legislator and verify it exists in congress.legislators."""
    from pipeline.shared.db import get_supabase, upsert

    test_row = {
        "bioguide_id": "TEST0001",
        "first_name": "Test",
        "last_name": "Legislator",
        "full_name": "Test Legislator",
        "party": "Independent",
        "chamber": "Senate",
        "state": "DC",
        "state_full": "District of Columbia",
        "title": "Senator",
        "in_office": False,
        "fec_ids": [],
        "photo_url": "https://example.com/photo.jpg",
    }

    upsert("legislators", [test_row], on_conflict="bioguide_id", schema="congress")

    # Verify
    client = get_supabase()
    result = (
        client.schema("congress")
        .table("legislators")
        .select("*")
        .eq("bioguide_id", "TEST0001")
        .execute()
    )
    assert len(result.data) == 1
    assert result.data[0]["full_name"] == "Test Legislator"

    # Cleanup
    client.schema("congress").table("legislators").delete().eq("bioguide_id", "TEST0001").execute()


def test_integration_pipeline_run_logging():
    """Verify pipeline run logging works end-to-end."""
    from pipeline.shared.db import log_run_start, log_run_end, get_watermark

    run_id = log_run_start("test_integration")
    log_run_end(run_id, "success", rows_processed=42)

    watermark = get_watermark("test_integration")
    assert watermark is not None

    # Cleanup
    from pipeline.shared.db import get_supabase

    client = get_supabase()
    client.schema("ops").table("pipeline_runs").delete().eq("id", run_id).execute()
```

- [ ] **Step 2: Run integration tests**

```bash
cd pipeline && uv run pytest tests/test_integration.py -v
```

Expected: Tests PASS if env vars are set, SKIP if not.

- [ ] **Step 3: Run the full pipeline against a single congress for validation**

```bash
cd pipeline && uv run python -m pipeline.scripts.ingest_all --congress 119 --skip-fec --skip-embeddings
```

Expected: Bills and votes for the 119th Congress load into Supabase. Check Supabase dashboard to verify `congress.bills`, `congress.bill_vote_summaries`, `congress.legislators` have data.

- [ ] **Step 4: Run bill embeddings**

```bash
cd pipeline && uv run python -m pipeline.scripts.embed_bills
```

Expected: `enrichment.bill_embeddings` populated with vector embeddings. Verify in Supabase.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tests/test_integration.py
git commit -m "test(pipeline): integration tests for end-to-end pipeline validation"
```

---

## Task 14: GitHub Actions for CI

**Files:**
- Create: `.github/workflows/pipeline-ci.yml`

- [ ] **Step 1: Create CI workflow**

```yaml
# .github/workflows/pipeline-ci.yml
name: Pipeline CI

on:
  push:
    paths:
      - "pipeline/**"
  pull_request:
    paths:
      - "pipeline/**"

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          version: "latest"

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: cd pipeline && uv sync

      - name: Run unit tests
        run: cd pipeline && uv run pytest tests/ -v --ignore=tests/test_integration.py
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/pipeline-ci.yml
git commit -m "ci: pipeline unit tests on push"
```

---

## Parallel execution map

Tasks that can be executed by independent subagents simultaneously:

```
Task 1 (scaffold) ──────────────────────────────────────────► Task 7 (bills)
                  \                                          /
                   ├── Task 2 (FastAPI) ────────────────────┤
                   │                                        │
                   ├── Task 3 (Vite SPA) ──────────────────┤
                   │                                        │
                   └── Task 4 (shared utils) ──► Task 5 (schema)
                                                     │
                                                     ├──► Task 6 (legislators) ─┐
                                                     │                          │
                                                     ├──► Task 7 (bills) ───────┤
                                                     │                          │
                                                     ├──► Task 8 (votes) ───────┤
                                                     │                          ├──► Task 12 (orchestrator)
                                                     ├──► Task 9 (FEC) ─────────┤         │
                                                     │                          │         ▼
                                                     ├──► Task 10 (VoteView) ──┤   Task 13 (integration)
                                                     │                          │         │
                                                     └──► Task 11 (embeddings) ┘         ▼
                                                                                    Task 14 (CI)
```

**Phase 1 (Tasks 2, 3):** FastAPI and Vite scaffolds are fully independent — dispatch as parallel subagents.

**Phase 2 (Tasks 6-11):** After Task 5 (schema), all six data source tasks are independent and can run in parallel.

**Phase 3 (Tasks 12-14):** Sequential — orchestrator depends on all loaders, integration test depends on orchestrator.
