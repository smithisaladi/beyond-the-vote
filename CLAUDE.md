# Beyond the Ballot

Political transparency app — track legislators, bills, votes, and campaign finance.

## Commands

### From repo root

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (localhost:5173) |
| `npm run build` | Production build |
| `npm run test` | Vitest (single run) |
| `npm run test:watch` | Vitest (watch mode) |

### API (apps/api)

| Command | Purpose |
|---------|---------|
| `uv run uvicorn app.main:app --reload` | FastAPI dev server (localhost:8000) |
| `uv run pytest` | Run API tests |

### Type check

| Command | Purpose |
|---------|---------|
| `cd apps/web && npx tsc --noEmit` | Type check frontend |

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite SPA, React 19, TanStack Router, TanStack Query |
| Language | TypeScript (strict) |
| Backend | FastAPI (async), SQLAlchemy 2.0, asyncpg |
| Database | Neon PostgreSQL |
| Auth | Neon Auth (Better Auth) — JWT via JWKS (EdDSA) |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React (strokeWidth 1.8) |
| Unit tests | Vitest + React Testing Library |
| Pipeline | Python 3.11+ (see `pipeline/CLAUDE.md`) |

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `apps/web/` | Vite SPA frontend |
| `apps/web/src/routes/` | TanStack Router file-based routes |
| `apps/web/src/components/` | Feature-organized React components |
| `apps/web/src/hooks/queries/` | TanStack Query hooks per resource |
| `apps/web/src/lib/` | Shared utilities, types, format helpers |
| `apps/web/src/lib/api/` | `apiFetch()` wrapper + openapi-fetch client |
| `apps/web/src/lib/auth/` | Neon Auth client |
| `apps/api/` | FastAPI backend |
| `apps/api/app/routers/` | One router per domain (bills, politicians, donors, dashboard) |
| `apps/api/app/schemas/` | Pydantic request/response models |
| `apps/api/app/db/` | SQLAlchemy models + async session |
| `apps/api/app/queries/` | Complex SQL (hybrid search, money flow) |
| `apps/api/app/ml/` | ML model loading + inference |
| `pipeline/` | Python ETL pipeline (has its own CLAUDE.md) |
| `shared/openapi/` | Generated OpenAPI schema + TS types (placeholder) |

## Key Conventions

- **Path alias**: `@/` resolves to `apps/web/src/`
- **All components are client-side** — no SSR, no server components
- **TypeScript strict mode** — no implicit `any`
- **`@/lib/ui`** — single source of truth for party/status styling (see Design System below)
- **Data fetching**: TanStack Query hooks in `hooks/queries/`, all use `apiFetch()` which injects Neon Auth JWT
- **Routing**: TanStack Router file-based routes in `src/routes/`, `<Link to=...>` with typed params

## Development Philosophy

- **Prioritize high-level design** — think through architecture, data flow, and component boundaries before writing code. Propose the approach first when the task involves structural decisions.
- **Avoid code smells** — no dead code, no unused imports, no copy-paste duplication, no `any` unless truly unavoidable. Extract shared logic into hooks or utilities when a pattern repeats. Keep components focused on one responsibility.
- **No product decisions without asking** — if a feature gap is found (e.g. missing data, empty states), present the problem and options instead of inventing workarounds or fallback behaviors.

## Auth Flow

1. User signs in via Neon Auth modal (Better Auth)
2. `apiFetch()` calls `authClient.getSession()` to get JWT
3. JWT sent as `Authorization: Bearer <token>` to FastAPI
4. FastAPI validates via JWKS (EdDSA/Ed25519) from Neon Auth endpoint
5. Protected routes use `_authenticated` layout wrapper in TanStack Router

## Design System

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Page background | `#F5F0E8` | All pages, headers |
| Text base | `#1C1C1A` | All text — use opacity modifiers (`/70`, `/45`, `/32`, etc.) |
| Accent | `#7B5E8A` | CTAs, active states, links, progress |
| Accent hover | `#6A4F78` | Button hover |
| Card surface | `white` | Cards, list containers |
| Skeleton fill | `#E8E3DA` | Loading placeholders |
| Card border | `rgba(28,28,26,0.08)` | Card/divider borders |
| Card shadow | `0_1px_4px_rgba(0,0,0,0.06)` | Subtle card elevation |
| Error/Nay | `#B85C38` | Warnings, nay votes, stalled/failed |
| Success/Passed | `#68B085` | Passed bills |

### Text Opacity Hierarchy

All text uses `text-[#1C1C1A]` with opacity — never use `text-gray-*`:
- `100%` headings → `80%` emphasized → `70%` body → `60%` secondary → `50%` metadata
- `45%` empty state → `38%` bill numbers, counts → `32%` timestamps → `30%` most subtle

### Party & Status Styles

**Always import from `@/lib/ui` — never hardcode these colors inline.**

| Style | Colors |
|-------|--------|
| Democrat | `#5E85A8` — `PARTY_STYLES.Democrat` |
| Republican | `#A87B7B` — `PARTY_STYLES.Republican` |
| Independent | `#8A8A7A` — `PARTY_STYLES.Independent` |
| Active | `#7B5E8A` — `STATUS_STYLES.Active` |
| Committee | `#8A8A7A` — `STATUS_STYLES.Committee` |
| Stalled/Failed | `#B85C38` — `STATUS_STYLES.Stalled` / `STATUS_STYLES.Failed` |
| Passed | `#68B085` — `STATUS_STYLES.Passed` |

### Typography

- **Serif** (`var(--font-serif)`): headings, names, bill titles — apply via `style={{ fontFamily: 'var(--font-serif)' }}` (never a Tailwind class)
- **Sans** (Tailwind default): all body text, labels, metadata
- **Mono** (`font-mono`): bill numbers only (e.g. `S. 1247`, `H.R. 4521`)
- Weights: `font-semibold` or `font-medium` for headings — never `font-bold` on body text

### Component Patterns

- **Card**: `<Card>` from `@/components/ui/Card`. Defaults: `padding="lg"` (p-6), standard border, soft shadow. Override via `padding` (`none`/`sm`/`md`/`lg`/`xl`), `border` (`standard`/`light`/`none`), `shadow` (bool), `hoverable` (bool, must be inside a `group` wrapper). Raw class constants `CARD_CLASS`, `CARD_LIGHT_BORDER_CLASS`, `CARD_HOVER_CLASS` are also exported from `@/lib/ui` for cases where a component isn't practical.
- **Badge**: `text-[11px] font-medium px-2 py-0.5 rounded-full` + party/status style from `@/lib/ui`
- **Section header**: `text-lg font-semibold` serif + `text-sm text-[#1C1C1A]/38` count/subtitle
- **Skeleton**: `<Skeleton className="h-4 w-24 rounded-full" />` from `@/components/ui/Skeleton`. Pair with an ancestor `animate-pulse`. Uses `SKELETON_BG` (`bg-[#E8E3DA]`) from `@/lib/ui`.
- **List dividers**: `border-b border-[rgba(28,28,26,0.05)]` or `divide-y divide-[rgba(28,28,26,0.05)]`
- **Icons**: Lucide with `strokeWidth={1.8}`, size 16–19px
- **Rounded corners**: `rounded-xl` cards, `rounded-lg` small buttons, `rounded-full` badges/pills/avatars

### Don'ts

- Never hardcode party/status colors — always use `PARTY_STYLES`/`STATUS_STYLES` from `@/lib/ui`
- Never use `text-gray-*` or `bg-gray-*` — use `text-[#1C1C1A]` with opacity
- Never use `shadow-lg` — only `shadow-sm` (buttons) and `shadow-[0_1px_4px_rgba(0,0,0,0.06)]` (cards)
- Never use `font-bold` on body text
- Never invent new colors outside the palette

## Environment Variables

### Frontend (`apps/web/.env`)

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_API_URL` | Yes | FastAPI URL (e.g. `http://localhost:8000`) |
| `VITE_NEON_AUTH_URL` | Yes | Neon Auth endpoint |
| `VITE_MAPBOX_TOKEN` | No | Mapbox address autocomplete |
| `VITE_SENTRY_DSN` | No | Sentry error tracking |

### Backend (`apps/api/.env`)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `NEON_AUTH_URL` | Yes | Neon Auth endpoint (for JWKS validation) |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `GEOCODIO_API_KEY` | Yes | Address → district lookup |
| `CONGRESS_API_KEY` | Pipeline | congress.gov API |
| `OPENFEC_API_KEY` | Pipeline | OpenFEC API |
| `SENTRY_DSN` | No | Sentry error tracking |

## Testing

- **Unit/component tests**: colocated as `*.test.ts(x)` in `apps/web/`, run with `npm run test`
- **API tests**: `apps/api/tests/`, run with `uv run pytest`

## Gotchas

- Bill search uses **hybrid FTS + trigram + semantic** with Reciprocal Rank Fusion — see `apps/api/app/queries/bills.py`
- Topic mapping lives in `apps/web/src/lib/topics.ts` — maps Congress.gov policyArea → 12 app topic slugs
- `toTitleCase()` in `apps/web/src/lib/format.ts` handles FEC ALLCAPS names
- Neon Auth signs JWTs with **EdDSA (Ed25519)** — backend validates via JWKS using PyJWT
- Vite dev server proxies `/api/*` to FastAPI at localhost:8000
- SVG topo background uses unique `id` per `<pattern>` to avoid collisions
