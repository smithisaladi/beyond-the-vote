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
| `uv run pytest` | Run API tests (integration tests skip without `TEST_DATABASE_URL`) |
| `docker compose -f docker-compose.test.yml up -d` | Start the local Postgres+pgvector test DB (host port 5433) |
| `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres uv run pytest -m integration` | Run real-DB integration tests |

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

Theme: **Restrained Dark**. Tokens are defined in `apps/web/src/index.css` (`@theme`). `apps/web/src/lib/ui.ts` is the single palette home for all component-level color constants.

### Color Tokens

All Tailwind classes reference CSS custom properties — never use raw hex values in component files.

| Token | CSS var / Tailwind class | Hex | Usage |
|-------|--------------------------|-----|-------|
| Page background | `bg-bg` | `#161614` | All page backgrounds |
| Card surface | `bg-surface` | `#1F1F1D` | Cards, list containers |
| Raised surface | `bg-raised` | `#262624` | Hover states, modals, floating menus |
| Foreground | `text-fg` | `#F5F0E8` | All text — use opacity modifiers |
| Border | `border-edge` | `rgba(245,240,232,0.07)` | Card/divider borders |
| Soft border | `border-edge-soft` | `rgba(245,240,232,0.05)` | Subtle list dividers |
| Accent | `text-accent` | `#B794D4` | Text links, icons, active indicators, stat micro-labels |
| Accent fill | `bg-accent-deep` | `#7B5E8A` | Button fills, CTAs |
| Accent hover | `bg-accent-deep-hover` | `#6A4F78` | Button hover state |

### Text Opacity Hierarchy

All text uses `text-fg` with Tailwind opacity modifiers — never use `text-gray-*`:
- `/100` headings → `/80` emphasized → `/70` body → `/60` secondary → `/50` metadata
- `/45` empty state → `/38` bill numbers, counts → `/32` timestamps → `/30` subtle → `/25` most faint

### Party & Status Styles

**Always import from `@/lib/ui` — never hardcode palette hexes in component files.**

| Style | Text hex | Export |
|-------|----------|--------|
| Democrat | `#8FBAE0` | `PARTY_STYLES.Democrat` |
| Republican | `#DCA8A8` | `PARTY_STYLES.Republican` |
| Independent | `#BBBBA6` | `PARTY_STYLES.Independent` |
| Active | `#B794D4` | `STATUS_STYLES.Active` |
| Committee | `#BBBBA6` | `STATUS_STYLES.Committee` |
| Stalled/Failed | `#E08B66` | `STATUS_STYLES.Stalled` / `STATUS_STYLES.Failed` |
| Passed | `#8FD9AC` | `STATUS_STYLES.Passed` |

Badge fills use `/[0.22]` opacity tint; badge borders use `/40` opacity. Each entry has `.bg` (tinted background + 1px border), `.text` (Tailwind text class), and `.hex` (raw hex for SVG `fill`/`stroke` inline styles). Also exported from `@/lib/ui`: `DANGER_HOVER_CLASS`, `DANGER_BUTTON_CLASS` (destructive action styling — uses `#E08B66`), `IDEOLOGY_GRADIENT` (left-right D→I→R gradient for ideology bars), `STAT_MONEY_CLASS` (`text-[#E8D9F0]`, for money stat tints), `STAT_POSITIVE_CLASS` (`text-[#C9ECD9]`, for positive/passed stat tints), `getPartyStyle()`, `resultBadge()`.

### Typography

- **Fraunces Variable** (`--font-serif` / `font-serif`, via CSS `@font-face`): display elements — page titles (26px), section headings (16px), entity names, hero headings, wordmark. Always use `font-semibold` (weight 600). Never apply `tracking-tight` to serif elements.
- **Geist Sans** (`--font-sans`, via `@fontsource-variable/geist`): all body text, labels, metadata, UI controls.
- **Geist Mono** (`font-mono`, via `@fontsource-variable/geist-mono`): all numbers — money amounts, percentages, bill IDs, stat display numbers (pair with `tabular-nums`).
- Weights: `font-semibold` or `font-medium` for headings — never `font-bold` on body text.

### Type Scale (Compact Density)

| Role | Class | Notes |
|------|-------|-------|
| Page title | `text-[26px] leading-tight font-serif font-semibold` | PageHeader `<h1>` |
| Section heading | `text-base font-serif font-semibold` | Card/section `<h2>` |
| Entity name (card) | `text-[15px] font-serif font-semibold` | Politician/donor name in list cards |
| Entity name (hero) | `text-2xl font-serif font-semibold` | Detail page hero |
| Body | `text-[13px]` | Default readable text |
| Meta / label | `text-xs` | Dates, counts, secondary info |
| Micro-label | `text-[10px] uppercase tracking-[0.07em] text-accent` | Stat card labels (directly above the number) |
| Stat number | `font-mono font-medium tabular-nums` at 17–20px (`text-xl`/`text-2xl`/`text-3xl`) | Money, counts, scores |
| PageHeader subtitle | `text-xs` | Below the page title |

### Elevation (No Shadows)

There are **no box shadows**. Elevation is expressed through background steps:
- Page: `bg-bg` → Cards: `bg-surface` → Raised/floating: `bg-raised`
- Hover lift: border brightens + `bg-surface` → `bg-raised` (see `CARD_HOVER_CLASS` from `@/lib/ui`)

### Motion

All animations are gated by `prefers-reduced-motion` via CSS. Library: `motion` (`motion/react`).

| Primitive | When to use |
|-----------|-------------|
| `<PageTransition>` from `@/components/ui/motion` | Wrap every route page component |
| `<StaggerGrid>` / `<StaggerItem>` | First-load list entrance animations |
| `TAP_SPRING` | `whileTap` spring for interactive elements |
| `.animate-flow` CSS class | Money-flow shimmer on SVG paths |

### Spacing Conventions

| Context | Value |
|---------|-------|
| Page padding | `px-6 py-6` |
| Grid gaps | `gap-3` (dense) / `gap-4` (standard) |
| Section stacks | `space-y-5` / `space-y-6` |
| List row padding | `py-2.5` (compact) / `py-3` (standard) |

### Component Patterns

- **Card**: `<Card>` from `@/components/ui/Card`. Defaults: `padding="lg"` (p-4), `rounded-lg`, standard border, no shadow. Padding map: `none` → `''`, `sm` → `p-2.5`, `md` → `p-3`, `lg` → `p-4`, `xl` → `p-8`. Override via `border` (`standard`/`light`/`none`), `hoverable` (bool, must be inside a `group` wrapper). Raw class constants `CARD_CLASS`, `CARD_LIGHT_BORDER_CLASS`, `CARD_HOVER_CLASS` are also exported from `@/lib/ui`.
- **Input**: `<Input>` from `@/components/ui/Input`. Sizing: `px-3 py-1.5 text-[13px]`. Dark-surfaced text field with focus ring.
- **Badge**: `text-[10px] font-medium px-1.5 py-px rounded-full` + party/status style from `@/lib/ui` (tinted bg + 1px border). `PartyBadge` has no size prop.
- **Section header**: `text-base font-serif font-semibold text-fg` + `text-xs text-fg/38` count/subtitle.
- **Skeleton**: `<Skeleton className="h-4 w-24 rounded-full" />` from `@/components/ui/Skeleton`. Pair with an ancestor `animate-pulse`. Uses `SKELETON_BG` from `@/lib/ui`.
- **List dividers**: `divide-y divide-edge-soft` or `border-b border-edge-soft`.
- **Icons**: Lucide React with `strokeWidth={1.8}`. Nav icons: 16px. Content icons: 14–18px. Brand marks and data-viz SVGs may remain inline.
- **Rounded corners**: `rounded-lg` cards and modals, `rounded-lg` buttons/inputs, `rounded-full` badges/pills/avatars. Never `rounded-xl` on card/modal surfaces.
- **Sidebar**: expanded 192px / collapsed 56px (constants in `@/lib/constants`).

### Don'ts

- Never hardcode palette hexes in component files — use Tailwind tokens (`bg-surface`, `text-fg/60`, etc.) or import from `@/lib/ui`
- Never use `text-gray-*` or `bg-gray-*`
- Never add any `shadow-*` Tailwind utilities — elevation is bg-step only
- Never use `font-bold` on body text
- Never apply `tracking-tight` to serif (`font-serif`) elements
- Never bypass tokens with raw cream (`#F5F0E8`) or old ink (`#1C1C1A`) values — the only allowed exception is the sidebar's `bg-[#1C1C1A]` ink surface
- Use `.hex` from party/status styles only for SVG `fill`/`stroke` inline attributes, not for Tailwind classes
- Micro-labels directly adjacent to a stat number (above or below) use `text-accent`; all other micro-labels (section labels, legend labels, panel headers) use `text-fg/40`

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
| `EMBEDDING_API_TOKEN` | No | Token for external `all-MiniLM-L6-v2` query-embedding endpoint. Blank → bill search falls back to FTS + trigram (no semantic). |
| `EMBEDDING_API_URL` | No | Override the embedding endpoint (default: HF Inference `sentence-transformers/all-MiniLM-L6-v2`). |
| `SENTRY_DSN` | No | Sentry error tracking |

## Testing

- **Unit/component tests**: colocated as `*.test.ts(x)` in `apps/web/`, run with `npm run test`. Frontend integration tests use MSW (`apps/web/src/test/` harness) to drive real query→render→network paths in jsdom — no backend needed.
- **API unit tests**: `apps/api/tests/*.py`, run with `uv run pytest`. These mock the DB session (`tests/conftest.py`).
- **API integration tests**: `apps/api/tests/integration/`, marked `@pytest.mark.integration`. They run endpoints against a **real Postgres** (pgvector + pg_trgm) bootstrapped from `pipeline/schema.sql`, with commit+truncate isolation. Requires Docker — start the DB with `docker compose -f apps/api/docker-compose.test.yml up -d`, then run with `TEST_DATABASE_URL` set (see Commands). Without that env var the suite skips. CI runs them in the `api-integration` job (Postgres service container). Integration test modules must set `pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]`.

## Gotchas

- Bill search uses **hybrid FTS + trigram + semantic** with Reciprocal Rank Fusion — see `apps/api/app/queries/bills.py`. The semantic leg is **best-effort**: query embeddings come from an external `all-MiniLM-L6-v2` endpoint (no torch in the API process — keeps it under 512MB). If `EMBEDDING_API_TOKEN` is unset or the endpoint fails, search degrades to FTS + trigram. Bill embeddings are precomputed by the pipeline.
- Topic mapping lives in `apps/web/src/lib/topics.ts` — maps Congress.gov policyArea → 12 app topic slugs
- `toTitleCase()` in `apps/web/src/lib/format.ts` handles FEC ALLCAPS names
- Neon Auth signs JWTs with **EdDSA (Ed25519)** — backend validates via JWKS using PyJWT
- Vite dev server proxies `/api/*` to FastAPI at localhost:8000
- SVG topo background uses unique `id` per `<pattern>` to avoid collisions
