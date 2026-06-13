# Beyond the Vote

Political transparency app that tracks U.S. legislators, bills, votes, and campaign finance. Search bills with hybrid full-text + semantic search, follow politicians, trace PAC money flows, and see AI-generated donor summaries.

## Architecture

```
apps/web/          React 19 SPA (Vite, TanStack Router, TanStack Query)
apps/api/          FastAPI async API (SQLAlchemy 2.0, asyncpg)
pipeline/          Python ETL pipeline (Congress.gov, OpenFEC, embeddings)
```

The frontend is a client-side SPA with code-split routes. The API layer uses raw SQL with parameterized queries against a Neon PostgreSQL database. Auth is handled by Neon Auth (Better Auth) with EdDSA JWT validation via JWKS.

## Key Features

- **Hybrid bill search** -- full-text search + trigram fuzzy matching + semantic vector similarity, fused with Reciprocal Rank Fusion (RRF)
- **Campaign finance tracking** -- PAC contributions, independent expenditures, money flow graph traversal
- **AI donor summaries** -- on-demand Claude-generated PAC analysis with per-key deduplication
- **Legislator profiles** -- voting records, committee memberships, ideology scores (DW-NOMINATE), funding breakdowns
- **Address-based lookup** -- find your representatives via Geocodio geocoding

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript (strict), TanStack Router, TanStack Query |
| Styling | Tailwind CSS 4, Fraunces (serif), Geist Sans/Mono |
| Backend | FastAPI (async), SQLAlchemy 2.0, asyncpg |
| Database | Neon PostgreSQL (pgvector, pg_trgm) |
| Auth | Neon Auth / Better Auth -- JWT via JWKS (EdDSA/Ed25519) |
| ML | sentence-transformers (all-MiniLM-L6-v2) for query embeddings |
| AI | Anthropic Claude (PAC summaries) |
| Pipeline | Python 3.11+, congress.gov API, OpenFEC API |

## Getting Started

### Prerequisites

- Node.js 22+
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Neon PostgreSQL database with pgvector and pg_trgm extensions

### Frontend

```bash
npm install
npm run dev            # Vite dev server on localhost:5173
```

### API

```bash
cd apps/api
uv sync
uv run uvicorn app.main:app --reload   # FastAPI on localhost:8000
```

### Environment Variables

**Frontend** (`apps/web/.env`):

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_API_URL` | Yes | FastAPI URL (e.g. `http://localhost:8000`) |
| `VITE_NEON_AUTH_URL` | Yes | Neon Auth endpoint |

**Backend** (`apps/api/.env`):

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `NEON_AUTH_URL` | Yes | Neon Auth endpoint (JWKS validation) |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `GEOCODIO_API_KEY` | Yes | Address-to-district lookup |
| `ANTHROPIC_API_KEY` | No | AI PAC summaries |

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run test` | Vitest (single run) |
| `cd apps/web && npx tsc --noEmit` | Type check frontend |
| `cd apps/api && uv run uvicorn app.main:app --reload` | API dev server |
| `cd apps/api && uv run pytest` | API tests |

## Project Structure

```
apps/web/src/
  routes/              TanStack Router file-based routes (lazy-loaded)
  components/          Feature-organized React components
  hooks/queries/       TanStack Query hooks per resource
  lib/                 Shared utilities, types, format helpers
  lib/api/             apiFetch() wrapper with JWT injection
  lib/ui.ts            Design system tokens (party/status styles)

apps/api/app/
  routers/             One router per domain (bills, politicians, donors, dashboard, representatives, money_flow)
  queries/             Complex SQL (hybrid search, money flow)
  ml/                  Embedding model loading + inference
  auth.py              JWKS-based JWT validation
  db/                  Async session factory

pipeline/              ETL scripts (Congress.gov, OpenFEC, embeddings)
```

## Testing

- **Frontend**: 113 unit tests across utilities and UI components (`npm run test`)
- **API**: 67 tests covering all 6 routers, auth, and health (`uv run pytest`)
- TypeScript strict mode with zero errors
- Production build with code-split lazy routes

## Design

Dark theme with a restrained palette. Elevation via background steps (no shadows). Typography uses Fraunces (serif display), Geist Sans (body), and Geist Mono (numbers). Party colors, status badges, and all style constants are centralized in `lib/ui.ts`.
