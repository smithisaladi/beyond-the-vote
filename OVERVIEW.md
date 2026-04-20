# Beyond the Vote — Deep-Dive Overview

> **Political Transparency for Every Voter**
>
> Track legislators, bills, votes, and campaign finance — all in one place.

Beyond the Vote is a nonpartisan political transparency app that connects voters to the people and money behind legislation. Users can look up their representatives by address, search and track bills through Congress, explore campaign finance data from the FEC, and build a personalized dashboard of the issues they care about.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Sources & Pipeline](#3-data-sources--pipeline)
4. [Database Schema](#4-database-schema)
5. [API Surface](#5-api-surface)
6. [Frontend Features](#6-frontend-features)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Data Flow Patterns](#8-data-flow-patterns)
9. [Design System](#9-design-system)
10. [Testing](#10-testing)
11. [Configuration & Deployment](#11-configuration--deployment)

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 19 |
| Language | TypeScript (strict mode) |
| Database | Supabase PostgreSQL + Auth + Row-Level Security |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React (`strokeWidth` 1.8) |
| Fonts | Fraunces (serif), Inter (sans) via `next/font` |
| Unit Tests | Vitest 4 + React Testing Library |
| E2E Tests | Playwright (Chromium + mobile) |
| Pipeline | Python 3.11+, DuckDB, `supabase-py` |
| AI | Anthropic Claude Haiku (donor analysis summaries) |
| Geocoding | Geocodio (address → district), Mapbox (autocomplete) |
| Validation | Zod |
| Deployment | Vercel |

---

## 2. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      DATA SOURCES                           │
│                                                             │
│  Congress.gov API    FEC Bulk Files    VoteView    senate.gov│
│  (bills, votes,     (PAC→candidate,   (DW-NOM     (vote     │
│   sponsors,          indep. expend.,   ideology    XML)      │
│   actions)           committee names)  scores)              │
│                                                             │
│  congress-legislators YAML    OpenFEC API                   │
│  (profiles, terms, committees) (weekly sync)                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   PYTHON PIPELINE                            │
│                                                              │
│  Bulk scripts (one-time)  ──►  Transform modules             │
│  Sync scripts (cron)      ──►  DuckDB aggregation            │
│  Checkpoints + watermarks      Load (upsert / delete+insert) │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│               SUPABASE POSTGRESQL                            │
│                                                              │
│  Core: bills, legislators, bill_vote_summaries/positions     │
│  FEC:  pac_to_candidate, independent_expenditures            │
│  Derived: funding_summary, top_pacs, top_contributors,       │
│           contributor_leaderboard_cache                       │
│  User: followed_politicians, tracked_bills, topic_preferences│
│  Meta: pipeline_runs, bulk_import_checkpoints                │
└──────────────────────┬───────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
     ┌─────────┐ ┌─────────┐ ┌──────────┐
     │ Browser │ │ Server  │ │ Raw SQL  │
     │ Client  │ │ Client  │ │ (postgres│
     │ (anon)  │ │ (cookie)│ │  npm pkg)│
     └────┬────┘ └────┬────┘ └────┬─────┘
          │            │            │
          └────────────┼────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                  NEXT.JS API ROUTES                           │
│                                                              │
│  /api/bills      /api/politicians    /api/donors             │
│  /api/representatives   /api/dashboard   /api/og             │
│                                                              │
│  Middleware: rate limiting, auth refresh, route guards        │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    REACT FRONTEND                             │
│                                                              │
│  Landing Page ─── Dashboard ─── Bills ─── Representatives    │
│       │                                        │             │
│     Donors ────── Settings ──── Auth Modals     │             │
│                                                              │
│  Hooks: useFetchBills, useTrackedBills, useAuth, ...         │
│  UI:    Card, Skeleton, PartyBadge, IdeologySpectrum, ...    │
└──────────────────────────────────────────────────────────────┘
```

### Three-Client Supabase Pattern

The app uses three distinct Supabase clients depending on context:

| Client | File | Auth | RLS | Use Case |
|--------|------|------|-----|----------|
| **Browser** | `lib/supabase/client.ts` | Anon key + cookies | Enforced | Client components, `useAuth()` |
| **Server** | `lib/supabase/server.ts` | Anon key + `cookies()` API | Enforced | Server components, API routes |
| **Service** | `lib/supabase/service.ts` | Service role key | Bypassed | Pipeline admin operations |
| **Raw SQL** | `lib/db.ts` | `DATABASE_URL` connection | N/A | Complex queries (FTS, trigram, aggregation) |

The raw SQL client (`postgres` npm package) exists because PostgREST cannot express hybrid search, full outer joins, or the aggregation queries needed for PAC detail. It connects via PgBouncer (port 6543) with transaction-mode pooling (`prepare: false`, `max: 10`, `idle_timeout: 20`).

### App Router Structure

```
app/
├── layout.tsx                          # Root: fonts, metadata, TooltipProvider
├── (authenticated)/                    # Route group (no URL prefix)
│   ├── layout.tsx                      # Conditional SidebarLayout (auth check)
│   ├── page.tsx                        # / → LandingPage (anon) | DashboardPage (auth)
│   ├── bills/
│   │   ├── page.tsx                    # Thin shim → BillsPage client component
│   │   └── [id]/
│   │       ├── page.tsx                # Server-side bill fetch → BillDetailPage
│   │       ├── layout.tsx              # Dynamic metadata (title, OG)
│   │       └── votes/[voteId]/page.tsx # Vote breakdown
│   ├── representatives/
│   │   ├── page.tsx                    # Thin shim → RepresentativesPage
│   │   └── [id]/page.tsx              # 8 parallel queries → RepresentativeDetailPage
│   ├── donors/
│   │   ├── page.tsx                    # Thin shim → DonorsPage
│   │   └── [cmteId]/page.tsx          # PAC detail
│   ├── settings/page.tsx              # Auth-gated (server redirect)
│   └── error.tsx                       # Error boundary
├── api/                                # API routes (see Section 5)
├── auth/
│   ├── callback/route.ts              # OAuth/magic-link code exchange
│   └── reset-password/page.tsx        # Password reset form
├── privacy/, terms/                    # Static legal pages
├── robots.ts, sitemap.ts              # SEO
└── globals.css                         # Tailwind directives
```

**Thin shim pattern**: Page files in `app/` are minimal server components that re-export client components from `components/`. This separates Next.js routing concerns (metadata, data fetching) from UI logic.

---

## 3. Data Sources & Pipeline

### External Data Sources

| Source | Data | Update Frequency | Access Method |
|--------|------|-------------------|---------------|
| **Congress.gov API** | Bills, votes, sponsors, cosponsors, actions, subjects | Hourly (Mon-Fri) | REST API (1000 req/hr limit) |
| **FEC Bulk Files** | PAC→candidate contributions, independent expenditures, committee names | Weekly | Pipe-delimited flat files (4GB+ per cycle) |
| **OpenFEC API** | Incremental FEC updates | Weekly | REST API |
| **VoteView** | DW-NOMINATE ideology scores | Daily | CSV download |
| **congress-legislators YAML** | Legislator profiles, terms, committee assignments | Daily | GitHub raw file |
| **senate.gov** | Senate vote XML (member-level positions) | Hourly (Mon-Fri) | XML endpoint |
| **Geocodio** | Address → congressional district | On-demand | REST API |
| **Mapbox** | Address autocomplete suggestions | On-demand | REST API |

### Pipeline Architecture

The Python pipeline (`pipeline/`) follows an Extract-Transform-Load pattern with two modes:

**Bulk scripts** (`scripts/bulk/`): One-time full imports for initial data population. Checkpoint-resumable — if a bulk import fails mid-batch, it picks up where it left off via the `bulk_import_checkpoints` table.

**Sync scripts** (`scripts/sync/`): Incremental updates using watermark timestamps from the `pipeline_runs` table. Each sync fetches only records modified since the last successful run.

**Compute scripts** (`scripts/`): Derived aggregations that read from source tables (or local CSVs) and write to derived tables. Use DuckDB as an in-memory SQL engine for aggregating pipe-delimited FEC files without loading them into Supabase.

### Key Pipeline Modules

| Module | Purpose |
|--------|---------|
| `config.py` | All constants: FEC cycles, column definitions, industry keywords, topic mapping, rate limits |
| `utils.py` | Supabase singleton, batch helper, FEC streaming, API rate limiter (950 req/hr), DuckDB context |
| `load.py` | Upsert, delete-then-insert, pipeline_run logging, checkpoint tracking |
| `transform/legislators.py` | YAML → legislator rows (current terms, standardized party, URLs) |
| `transform/bills.py` | Congress.gov detail → bill rows (sponsor, topics, heuristic status) |
| `transform/pac_to_cand.py` | FEC pas2.txt → PAC→candidate rows (filter 24K/24Z direct contributions) |
| `transform/ind_exp.py` | FEC dte.txt → independent expenditure rows (support/oppose classification) |
| `transform/votes_house.py` | Congress.gov /votes → vote summaries + per-member positions |
| `transform/votes_senate.py` | senate.gov XML → vote summaries + per-senator positions |
| `transform/member_scores.py` | VoteView CSV → ideology scores per congress |

### Run Order (FK Dependencies)

Bulk imports must follow this sequence:

| Step | Script | Tables Written |
|------|--------|----------------|
| 1 | `bulk_import_legislators` | `legislators`, `committee_memberships` |
| 2 | `bulk_import_member_scores` | `member_scores` |
| 3 | `bulk_import_bills --congress 118 119` | `bills` |
| 4 | `bulk_import_votes --congress 118 119` | `bill_vote_summaries`, `bill_vote_positions` |
| 5 | `bulk_import_bills --voted-only` | Prunes unvoted bill stubs |
| 6 | `bulk_import_fec` | `pac_to_candidate`, `independent_expenditures` + local CSVs |
| 7 | `compute_funding_summaries` | `legislator_funding_summary`, `legislator_top_pacs`, `legislator_top_contributors` |
| 8 | `compute_leaderboard_cache` | `contributor_leaderboard_cache` |

### GitHub Actions Schedules

| Workflow | Schedule | Scripts |
|----------|----------|---------|
| `sync-daily.yml` | 06:00 UTC daily | `sync_legislators` + `sync_member_scores` |
| `sync-bills.yml` | Hourly Mon-Fri :30 | `sync_bills` |
| `sync-bill-votes.yml` | Hourly Mon-Fri :00 | `sync_votes` |
| `sync-weekly.yml` | 07:00 UTC Sundays | `sync_fec` → `compute_leaderboard_cache` |

### Storage Budget

~55MB of the 500MB Supabase allocation:

| Table | Size |
|-------|------|
| `bill_vote_positions` | ~15MB |
| `pac_to_candidate` | ~12MB |
| `independent_expenditures` | ~10MB |
| `bills` | ~8MB |
| `bill_vote_summaries` | ~5MB |
| Everything else | <5MB |

---

## 4. Database Schema

### Core Tables

**`bills`** — Legislation from Congress.gov
- PK: `bill_id` (e.g., `119-hr-4521`)
- Fields: `congress`, `title`, `summary`, `status`, `topics[]`, `policy_area`, `sponsor_bioguide_id`, `introduced_date`, `search_vector` (tsvector), `referenced_agencies[]`, `referenced_laws[]`, `referenced_usc[]`
- Indexes: GIN on `search_vector` (FTS), GIN trigram on `title` (fuzzy), GIN on `topics` (array containment)
- `search_vector` auto-updated by trigger with weights: title (A) > summary (B) > metadata (C) > bill_number (D)

**`legislators`** — Member profiles
- PK: `bioguide_id` (universal FK key across the system)
- Fields: `full_name`, `party`, `chamber`, `state`, `district`, `fec_ids[]`, `lis_id`, `icpsr_id`, `photo_url`, `website`, `phone`, `address`, `term_start`, `term_end`, `next_election`, `raw_json`
- `fec_ids` is an array with GIN index — enables `cand_id = ANY(l.fec_ids)` joins without a junction table

**`bill_vote_summaries`** — Roll call results with party breakdown
- PK: `id` (format: `{chamber}-{congress}-{roll_call}`)
- Fields: `bill_id`, `congress`, `chamber`, `date`, `result`, `yea_total/nay_total`, `yea_democrat/nay_democrat`, `yea_republican/nay_republican`, `yea_independent/nay_independent`, `source_url`

**`bill_vote_positions`** — Per-member vote positions
- Composite: `vote_id` (FK → summaries) + `bioguide_id` (FK → legislators)
- Fields: `position` ('Yea' | 'Nay' | 'Not Voting' | 'Present')

### FEC Tables

**`pac_to_candidate`** — Direct PAC contributions (cycles 2024, 2026)
- PK: `sub_id`
- Fields: `cmte_id`, `cand_id`, `transaction_amt`, `transaction_dt`, `cycle`

**`independent_expenditures`** — Independent expenditures (pro/con)
- PK: `sub_id`
- Fields: `cmte_id`, `cand_id`, `sup_opp` ('S' = support, 'O' = oppose), `transaction_amt`, `cycle`

**`fec_cmte_names`** — Committee name/org lookup
- PK: `cmte_id`
- Fields: `cmte_name`, `connected_org`

### Derived Tables (Pipeline-Computed, Never Source Data)

**`legislator_top_pacs`** — Top PACs per legislator per cycle
- Fields: `bioguide_id`, `cycle`, `cmte_id`, `cmte_name`, `industry`, `direct_contribution`, `ie_for`, `ie_against`, `total_support`, `rank`

**`legislator_top_contributors`** — Top individual/org donors per legislator per cycle
- Fields: `bioguide_id`, `cycle`, `org_name`, `individual_total`, `pac_total`, `grand_total`, `rank`

**`legislator_funding_summary`** — Funding breakdown visualization source
- Fields: `bioguide_id`, `cycle`, `pac_direct_total`, `large_donor_total`, `small_donor_total`, `superpac_ie_for/against`, `in_state_total`, `out_of_state_total`

**`contributor_leaderboard_cache`** — Pre-computed weekly PAC leaderboard
- PK: `cmte_id`
- Fields: `cmte_name`, `direct_total`, `ie_for_total`, `ie_against_total`, `total_contributions`, `recipient_count`, `top_recipients` (JSONB array of top 5 legislators with party/amount)

### User Tables (RLS-Protected)

| Table | Fields | Purpose |
|-------|--------|---------|
| `followed_politicians` | `user_id`, `politician_id`, `created_at` | Politicians user follows |
| `tracked_bills` | `user_id`, `bill_id`, `created_at` | Bills user tracks |
| `topic_preferences` | `user_id`, `topic` | User's selected topic interests |
| `profiles` | `id`, `display_name`, `avatar_url`, `activity_last_seen_at` | User metadata + activity read state |

All user tables have `ON DELETE CASCADE` from `auth.users` and RLS policies enforcing `auth.uid() = user_id`.

### Reference Tables

| Table | PK | Purpose |
|-------|-----|---------|
| `committees` | `thomas_id` | Congressional committee metadata |
| `committee_memberships` | `bioguide_id` + `committee_id` | N:M join |
| `member_scores` | `bioguide_id` + `congress` | DW-NOMINATE ideology scores |
| `pipeline_runs` | `id` (UUID) | ETL execution log + watermarks |
| `bulk_import_checkpoints` | `id` | Resumable bulk import progress |

### Key Schema Decisions

1. **`fec_ids` as array** with GIN index — cleaner than a junction table for 1-3 IDs per legislator
2. **`topics` as text array** with GIN index — enables `@>` containment queries without joins
3. **`top_recipients` as JSONB** in leaderboard cache — pre-computed to avoid secondary joins on the frontend
4. **`raw_json` JSONB** on legislators — stores full source record for future extensibility without migrations
5. **`search_vector` tsvector** on bills — auto-updated by trigger, enables sub-100ms hybrid search
6. **Separate `bill_vote_positions`** — many-to-many split from summaries enables per-legislator vote history queries

---

## 5. API Surface

### Middleware (`middleware.ts`)

All requests pass through middleware that handles:
- **Rate limiting**: All `/api/` routes limited by IP address
- **Auth session refresh**: Supabase token refresh for protected paths
- **Route guards**: `/settings` redirects unauthenticated users to `/?redirect=/settings`; `/dashboard` redirects authenticated users to `/`

### Bills

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/bills` | GET | Paginated bill search/browse with filters |
| `/api/bills/search` | GET | Text search (hybrid FTS + trigram) |
| `/api/bills/[id]` | GET | Bill detail with votes (Congress.gov + local DB) |
| `/api/bills/by-topic` | GET | Bills filtered by topic slug |

**Bill search** uses two modes:
1. **Text search**: Calls `hybridBillSearch()` — full-text search via `websearch_to_tsquery()` combined with trigram similarity via `pg_trgm`, fused with Reciprocal Rank Fusion scoring (`1.0/(60+rank_fts) + 0.5/(60+rank_trgm)`)
2. **Browse mode**: Direct Supabase query with status, topic, date, and sort filters

**Bill detail** fetches from Congress.gov API (sponsors, cosponsors, actions, summaries) and local Supabase (vote summaries + per-member positions) in parallel. Local vote data is preferred when available because it includes party-level breakdowns.

All bill endpoints validate parameters with Zod schemas from `lib/api-validation.ts`.

### Representatives & Politicians

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/representatives` | GET | Address → geocode → legislators (Geocodio + Supabase) |
| `/api/politicians/search` | GET | Name search across `legislators` table |
| `/api/politicians/[id]` | GET | Full politician detail (multi-source cascade) |

**Representative lookup** flow: address → Geocodio API → congressional districts → extract legislators → parallel Supabase queries for photos + ideology scores → enrich from Congress.gov (terms, websites).

**Politician detail** runs 8 parallel `Promise.allSettled` queries:
1. Legislator profile
2. Ideology scores (NOMINATE dim1/dim2)
3. Committee memberships
4. Last donor pipeline run timestamp (freshness indicator)
5. Top PACs (40 results, filtered to remove party committees/ActBlue/WinRed)
6. Funding summary (2 cycles)
7. Top contributors (40 results)
8. Recent votes (50 results) with bill title lookup

### Donors

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/donors` | GET | Paginated PAC leaderboard (from `contributor_leaderboard_cache`) |
| `/api/donors/[cmteId]` | GET | PAC detail with recipients + AI summary |

**PAC detail** uses the `pacDetail()` query to aggregate direct contributions and independent expenditures per recipient, then generates a 2-paragraph analysis using Claude Haiku (`claude-haiku-4-5-20251001`).

### Dashboard (Authenticated)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dashboard/followed` | GET | User's followed politicians with latest votes |
| `/api/dashboard/tracked-bills` | GET | User's tracked bills with current status |
| `/api/dashboard/topic-preferences` | GET/POST/PUT/DELETE | User's topic interest CRUD |

### OG Image Generation (`/api/og`)

Edge-runtime route that generates 1200x630px OpenGraph images using `next/og`:
- **Default**: Wordmark + tagline on cream background
- **Politician**: Name (serif), party badge, state, title
- **Bill**: Bill number, title (serif), status badge

Query params: `?type=politician&name=X&party=Y&state=Z` or `?type=bill&number=X&title=Y&status=Z`

---

## 6. Frontend Features

### Landing Page (`/` — unauthenticated)

The public entry point with a tab switcher between three feature previews:

- **Representatives Tab**: Address input with Mapbox autocomplete → representative cards with photo, party badge, title
- **Bills Tab**: Search bar with topic/status filters → bill preview cards
- **Donors Tab**: PAC search → top contributor cards

Includes hero section, feature cards, and auth CTAs (Sign In / Sign Up modals).

### Dashboard (`/` — authenticated)

Personalized home page with three sections:

- **Activity Feed** (left column): Chronological stream of updates from followed politicians and tracked bills. Tabs filter by All/Bills/Votes. Unread items highlighted with colored bar (tracked via `activity_last_seen_at` on profiles).
- **Following** (right column, top): List of followed politicians with photo, name, party badge, state. Unfollow via X button with optimistic UI.
- **Tracked Bills** (right column, bottom): Bills being tracked with number (mono font), status badge, title.

Greeting is time-based ("Good morning", "Good afternoon", "Good evening").

### Bills (`/bills`)

Full-featured bill search and browse interface:

- **Search**: Text input with 300ms debounce → hybrid FTS + trigram search
- **Filters**: Multi-select status (Active/Committee/Stalled/Passed/Failed), multi-select topics (25 categories), date range (All/Last Month/Last Year), sort (Newest/Oldest), tracked-only toggle
- **Results**: Card grid with bill number, title, status badge, sponsor, summary snippet, track/untrack button
- **Pagination**: Infinite scroll via "Load more"
- **URL sync**: All filter state persisted to URL params via `replaceState` for shareable/bookmarkable filtered views

### Bill Detail (`/bills/[id]`)

Two-phase loaded: server-side initial data for fast First Contentful Paint, then client-side background enrichment (cosponsors, subjects, full actions).

Sections:
- Bill number (mono), title (serif), status badge
- Summary and basic info (introduced date, policy area, topics)
- Sponsor and cosponsors with party badges (linked to representative detail)
- Actions/history timeline
- Vote records with party breakdown (Yea/Nay by Democrat/Republican/Independent)
- Per-member vote positions
- Congress.gov external link
- Track/untrack button

### Representatives (`/representatives`)

Dual search modes via tab switcher:

- **By Address**: Text input → Mapbox autocomplete → Geocodio geocoding → representative cards (2 senators + 1 House member)
- **By Name**: Text input (min 3 characters) → real-time search across legislators table

### Representative Detail (`/representatives/[id]`)

Comprehensive politician profile (8 parallel server-side queries):

- **Header**: Photo, name (serif), title, party badge, state/district
- **Stats**: Years in office, ideology score (DW-NOMINATE left-right spectrum)
- **Voting Record Tab**: Table of recent votes with bill titles, positions, results
- **Bills Sponsored Tab**: Legislation they've introduced
- **Donors Tab**: Top contributors, funding breakdown by source type
  - PAC direct, individual large/small, party, self-funded percentages
  - In-state vs out-of-state geographic breakdown
  - Donor alignment analysis (do donors correlate with voting patterns?)
  - PAC filtering removes party committees, ActBlue, WinRed to focus on issue-aligned PACs
- **Committees Tab**: Committee assignments

### Donors (`/donors`)

Campaign finance leaderboard:

- **Search**: Filter PACs by organization name
- **PAC Cards**: Rank, organization name (serif), total contributions, recipient count, political lean pill (Leans Democrat / Republican / Mixed with percentage)
- **Pagination**: "Load more" for infinite scroll

### Donor Detail (`/donors/[cmteId]`)

Individual PAC profile:
- Organization name, FEC ID, total contributions
- Top 20 recipients with amounts and party breakdown
- AI-generated 2-paragraph analysis (Claude Haiku) summarizing the PAC's spending patterns

### Settings (`/settings`)

Account management (auth-gated with server-side redirect):
- **Profile**: Editable display name, read-only email
- **Change Password**: Current + new password with validation
- **Danger Zone**: Account deletion with confirmation modal (cascades to all user data)

---

## 7. Authentication & Authorization

### Auth Flow

```
User clicks "Sign In"
  │
  ├─► Email/Password
  │     └─► supabase.auth.signInWithPassword()
  │           ├─► Success: close modal, honor ?redirect= param or router.refresh()
  │           └─► Error: display message
  │
  └─► Google OAuth
        └─► supabase.auth.signInWithOAuth({ provider: 'google' })
              └─► Browser → Google → /auth/callback
                    └─► Exchange PKCE code for session
                          └─► 302 redirect to / (or ?next= param)
```

### Session Management

- **Middleware** (`middleware.ts`): Refreshes Supabase session on every request to protected paths. Rate limits all API routes by IP.
- **Server Components**: `(authenticated)/layout.tsx` calls `getUser()` once, conditionally renders `SidebarLayout` (auth) or bare children (anon). Result cached within the request.
- **Client Components**: `useAuth()` hook subscribes to `onAuthStateChange` for real-time auth state. Returns `{ user, loading, error, signOut }`.
- **API Routes**: Protected endpoints call `getUser()` and return 401 if unauthenticated.

### Route Protection

| Route | Auth Required | Mechanism |
|-------|--------------|-----------|
| `/bills`, `/representatives`, `/donors` | No | Public, with auth-gated actions (track, follow) |
| `/settings` | Yes | Server-side redirect to `/?redirect=/settings` |
| `/api/dashboard/*` | Yes | 401 response |
| Everything else | No | Public |

### Security Measures

- **PKCE**: OAuth codes are short-lived, single-use, browser-session-bound
- **SameSite cookies**: Supabase SSR client uses strict SameSite
- **No open redirects**: Callback handler validates `next` param (must start with `/`, not `//`)
- **RLS**: All user tables enforce `auth.uid() = user_id` at the database level
- **Rate limiting**: IP-based throttling on all API routes
- **No client token leaks**: Service role key never exposed to browser

---

## 8. Data Flow Patterns

### Two-Phase Loading (SSR + Client Enrichment)

Used on bill and representative detail pages:

1. **Server phase**: `page.tsx` fetches initial data from Supabase and passes as `initialBill` / `initialPolitician` prop
2. **Client phase**: Component renders immediately (fast FCP), then a hook fires a background fetch to the API route for enriched data (cosponsors, full vote breakdowns, external API data)
3. **Merge**: If fresh data arrives, it's merged into state. Server-rendered data is preserved if the API response is slower or stale.

### Optimistic UI Updates

Track/follow toggles update local state immediately, then fire the Supabase mutation:

```
User clicks "Track" → Set.add(billId) → render updated UI
                     → supabase.from('tracked_bills').insert()
                       ├─► Success: no-op (UI already correct)
                       └─► Error: Set.delete(billId) → revert UI
```

### URL State Sync

Filter state on `/bills` is persisted to URL params via `window.history.replaceState()` (not `pushState`, to avoid cluttering browser history). On mount, state is restored from `searchParams`. This enables shareable/bookmarkable filtered views.

### Paginated Fetch (`usePaginatedFetch`)

Generic hook wrapping paginated API calls:
- Manages `data[]`, `loading`, `error`, `offset`, `total`, `loadMore()`, `hasMore`
- Auto-resets offset to 0 when `resetKey` changes (e.g., new search query)
- Uses `AbortController` — cancels in-flight requests on unmount or dep change
- Suppresses `AbortError` in catch blocks

### Topic Preferences (Hybrid Storage)

- **Authenticated users**: Stored in Supabase (`topic_preferences` table)
- **Anonymous users**: Stored in `localStorage` under key `btb_topics`
- `useTopicPreferences` hook abstracts this: `toggle(topic)` writes to the appropriate store

---

## 9. Design System

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Page background | `#F5F0E8` | All pages, headers |
| Text base | `#1C1C1A` | All text (use opacity modifiers) |
| Accent | `#7B5E8A` | CTAs, active states, links, progress |
| Accent hover | `#6A4F78` | Button hover |
| Card surface | `white` | Cards, list containers |
| Skeleton fill | `#E8E3DA` | Loading placeholders |
| Card border | `rgba(28,28,26,0.08)` | Card/divider borders |
| Card shadow | `0_1px_4px_rgba(0,0,0,0.06)` | Subtle card elevation |
| Error/Nay | `#B85C38` | Warnings, nay votes, stalled/failed |
| Success/Passed | `#68B085` | Passed bills |

### Text Opacity Hierarchy

All text uses `text-[#1C1C1A]` with opacity — never `text-gray-*`:

| Opacity | Role |
|---------|------|
| 100% | Headings |
| 80% | Emphasized |
| 70% | Body |
| 60% | Secondary |
| 50% | Metadata |
| 45% | Empty state |
| 38% | Bill numbers, counts |
| 32% | Timestamps |
| 30% | Most subtle |

### Party & Status Colors

Always imported from `@/lib/ui` — never hardcoded inline.

| Style | Hex | Token |
|-------|-----|-------|
| Democrat | `#5E85A8` | `PARTY_STYLES.Democrat` |
| Republican | `#A87B7B` | `PARTY_STYLES.Republican` |
| Independent | `#8A8A7A` | `PARTY_STYLES.Independent` |
| Active | `#7B5E8A` | `STATUS_STYLES.Active` |
| Committee | `#8A8A7A` | `STATUS_STYLES.Committee` |
| Stalled/Failed | `#B85C38` | `STATUS_STYLES.Stalled` / `.Failed` |
| Passed | `#68B085` | `STATUS_STYLES.Passed` |

### Typography

- **Serif** (Fraunces via `var(--font-serif)`): Headings, names, bill titles — applied via `style={{ fontFamily: 'var(--font-serif)' }}`
- **Sans** (Inter, Tailwind default): Body text, labels, metadata
- **Mono** (`font-mono`): Bill numbers only (e.g., `S. 1247`, `H.R. 4521`)
- Weights: `font-semibold` or `font-medium` for headings — never `font-bold` on body text

### Component Primitives

| Component | File | Description |
|-----------|------|-------------|
| `Card` | `components/ui/Card.tsx` | White card with configurable padding (`none`/`sm`/`md`/`lg`/`xl`), border (`standard`/`light`/`none`), shadow, hoverable |
| `Skeleton` | `components/ui/Skeleton.tsx` | Loading placeholder (`bg-[#E8E3DA]`), pair with ancestor `animate-pulse` |
| `PartyBadge` | `components/shared/PartyBadge.tsx` | Party label with party-colored background |
| `InfoTooltip` | `components/shared/InfoTooltip.tsx` | Radix tooltip wrapper |
| `DotGridBackground` | `components/shared/DotGridBackground.tsx` | Animated SVG dot grid pattern |

### Rules

- Never hardcode party/status colors — always use `PARTY_STYLES`/`STATUS_STYLES`
- Never use `text-gray-*` or `bg-gray-*` — use `text-[#1C1C1A]` with opacity
- Never use `shadow-lg` — only `shadow-sm` (buttons) and `shadow-[0_1px_4px_rgba(0,0,0,0.06)]` (cards)
- Never use `font-bold` on body text
- Icons: Lucide with `strokeWidth={1.8}`, size 16-19px
- Rounded corners: `rounded-xl` (cards), `rounded-lg` (small buttons), `rounded-full` (badges/pills/avatars)

---

## 10. Testing

### Unit & Component Tests (Vitest)

- **Config**: `vitest.config.ts` — jsdom environment, globals enabled, CSS disabled
- **Setup**: `vitest.setup.ts` — imports `@testing-library/jest-dom`, mocks `next/image` → `<img>`, `next/link` → `<a>`, `next/navigation`
- **Convention**: Colocated as `*.test.ts(x)` alongside source files
- **Coverage scope**: `lib/`, `components/`, `app/api/`, `middleware.ts`
- **Commands**:
  - `npm run test` — single run
  - `npm run test:watch` — watch mode
  - `npm run test:coverage` — V8 coverage (HTML + LCOV)

### E2E Tests (Playwright)

- **Config**: `playwright.config.ts` — Chromium + mobile Chrome (Pixel 5), 2 retries in CI
- **Test directory**: `e2e/`
- **Specs**: `auth.spec.ts`, `bills.spec.ts`, `representatives.spec.ts`, `donors.spec.ts`, `smoke.spec.ts`, `visual.spec.ts`
- **Screenshots**: On failure only; visual comparison with `maxDiffPixelRatio: 0.02`
- **Web server**: Auto-starts `npm run dev` (reuses existing in CI)
- **Command**: `npm run test:e2e`

### Type Checking

```bash
npx tsc --noEmit
```

TypeScript strict mode is enforced — no implicit `any`.

---

## 11. Configuration & Deployment

### Environment Variables

| Variable | Required | Context | Notes |
|----------|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Both | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Both | Public anon key (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only | Admin key, bypasses RLS |
| `DATABASE_URL` | Yes | Server only | Raw Postgres connection (PgBouncer, port 6543) |
| `NEXT_PUBLIC_SITE_URL` | Production | Both | Canonical URL (defaults to localhost:3000) |
| `CONGRESS_API_KEY` | Pipeline | Server only | Congress.gov API (1000 req/hr) |
| `FEC_API_KEY` | Pipeline | Server only | OpenFEC API |

### Next.js Configuration

- **Image optimization**: Remote patterns for GitHub avatars, congress.gov images, FEC assets
- **Package imports optimization**: `lucide-react` tree-shaking via `optimizePackageImports`

### SEO

- **`robots.ts`**: Allows indexing on production, disallows on Vercel preview deployments
- **`sitemap.ts`**: Dynamic sitemap generation from canonical URL
- **Metadata**: Per-route title templates (`"%s | Beyond the Vote"`), dynamic OG images via `/api/og`
- **Viewport**: Device width, no zoom, theme color `#F5F0E8`

### Deployment

Vercel-ready out of the box:
- Next.js 15 App Router with edge-compatible OG image generation
- Environment variables configured via Vercel Project Settings
- Preview deployments automatically excluded from search engine indexing
- Supabase connection via PgBouncer for serverless-compatible connection pooling

---

## Key Files Reference

| Area | File | Purpose |
|------|------|---------|
| **Config** | `CLAUDE.md` | Project conventions & developer guide |
| **Config** | `lib/site-config.ts` | Brand name, tagline, canonical URL |
| **Config** | `lib/constants.ts` | Sidebar widths, debounce timings |
| **Design** | `lib/ui.ts` | Party/status styles, card classes, design tokens |
| **Types** | `lib/types.ts` | Shared TypeScript types |
| **Format** | `lib/format.ts` | `toTitleCase()`, `formatTotal()`, `formatBillType()` |
| **Topics** | `lib/topics.ts` | 25 topics with slug mapping |
| **Bills** | `lib/bills.ts` | `mapStatus()`, `formatBillId()`, status heuristics |
| **Search** | `lib/queries/hybrid-bill-search.ts` | FTS + trigram RRF query |
| **DB** | `lib/db.ts` | Raw Postgres client (PgBouncer) |
| **Auth** | `hooks/useAuth.ts` | Client-side auth state |
| **Middleware** | `middleware.ts` | Rate limiting, auth refresh, guards |
| **Pipeline** | `pipeline/CLAUDE.md` | Pipeline-specific conventions |
| **Pipeline** | `pipeline/config.py` | All pipeline constants |
