# Beyond the Ballot

Political transparency app — track legislators, bills, votes, and campaign finance.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (localhost:3000) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (single run) |
| `npm run test:watch` | Vitest (watch mode) |
| `npm run test:coverage` | Vitest with V8 coverage |
| `npm run test:e2e` | Playwright end-to-end |
| `npx tsc --noEmit` | Type check only |

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router), React 19 |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL + Auth + RLS |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React (strokeWidth 1.8) |
| Unit tests | Vitest + React Testing Library |
| E2E tests | Playwright |
| Pipeline | Python 3.11+ (see `pipeline/CLAUDE.md`) |

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `app/(authenticated)/` | Authed pages: dashboard, bills, representatives, donors, settings |
| `app/api/` | API routes (bills, politicians, representatives, donors, og) |
| `components/` | Feature-organized React components (bills/, representatives/, landing/, etc.) |
| `hooks/` | Custom hooks (useFetchBills, useAuth, etc.) |
| `lib/` | Shared utilities, types, format helpers |
| `lib/supabase/` | Three Supabase clients: `client.ts` (browser), `server.ts` (SSR), `service.ts` (admin) |
| `lib/queries/` | SQL query functions (hybrid-bill-search, lookup-bill, etc.) |
| `pipeline/` | Python ETL pipeline (has its own CLAUDE.md) |
| `supabase/migrations/` | PostgreSQL DDL migrations |
| `e2e/` | Playwright test specs |

## Key Conventions

- **Thin shim pattern**: `app/.../page.tsx` files re-export client components from `components/`
- **Path alias**: `@/` resolves to repo root
- **Server components by default** — add `'use client'` only when needed
- **TypeScript strict mode** — no implicit `any`
- **`@/lib/ui`** — single source of truth for party/status styling (see Design System below)

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

## Supabase

Three clients for different contexts:
- **Browser** (`lib/supabase/client.ts`): `createBrowserClient()` — client components
- **Server** (`lib/supabase/server.ts`): `createClient()` — server components, API routes
- **Service** (`lib/supabase/service.ts`): `createServiceClient()` — admin/pipeline operations, bypasses RLS

Raw SQL queries via `postgres` package in `lib/db.ts` for complex joins and search.

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only, bypasses RLS |
| `DATABASE_URL` | Yes | Raw postgres connection (for lib/db.ts) |
| `CONGRESS_API_KEY` | Pipeline | congress.gov API |
| `FEC_API_KEY` | Pipeline | OpenFEC API |

## Testing

- **Unit/component tests**: colocated as `*.test.ts(x)`, run with `npm run test`
- **Setup**: `vitest.setup.ts` mocks `next/image`, `next/link`, `next/navigation`
- **E2E**: Playwright against dev server, specs in `e2e/`
- **Coverage scope**: `lib/`, `components/`, `app/api/`

## Gotchas

- Bill search uses **hybrid FTS + trigram** with Reciprocal Rank Fusion — see `lib/queries/hybrid-bill-search.ts`
- Middleware (`middleware.ts`) refreshes Supabase auth session on every request
- Topic mapping lives in `lib/topics.ts` — maps Congress.gov policyArea → 12 app topic slugs
- `toTitleCase()` in `lib/format.ts` handles FEC ALLCAPS names
- Schema changes go in `supabase/migrations/`, not in pipeline `db/schema.sql`
- SVG topo background uses unique `id` per `<pattern>` to avoid collisions
