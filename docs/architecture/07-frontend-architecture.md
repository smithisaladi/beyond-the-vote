# Frontend Architecture

The frontend is a Vite-powered React 19 SPA using TanStack Router for type-safe file-based routing, TanStack Query for server state, and Tailwind CSS 4 for styling. There is no SSR — all rendering is client-side.

## Technology Choices

| Concern | Choice | Why |
|---------|--------|-----|
| Build tool | Vite | Fast HMR, native ESM, simple config |
| Framework | React 19 | Ecosystem, concurrent features |
| Routing | TanStack Router | Type-safe, file-based, loader support |
| Server state | TanStack Query | Caching, deduplication, background refetch |
| Styling | Tailwind CSS 4 | Utility-first, design system consistency |
| Icons | Lucide React | Tree-shakeable, consistent stroke width |
| Auth | Neon Auth SDK | Integrates with Neon database auth |
| HTTP | `fetch` (via `apiFetch`) | Native, no axios dependency |
| Types | TypeScript strict | No implicit `any` |

## File-Based Routing

TanStack Router generates routes from the filesystem:

```
src/routes/
├── __root.tsx                          # Root layout (providers)
├── index.tsx                           # / → Landing page
├── auth/
│   └── $pathname.tsx                   # /auth/signin, /auth/signup
└── _authenticated/                     # Protected layout
    ├── home.tsx                        # /home → Dashboard
    ├── representatives/
    │   ├── index.tsx                   # /representatives
    │   └── $id.tsx                     # /representatives/:id
    ├── bills/
    │   ├── index.tsx                   # /bills
    │   └── $billId/
    │       └── votes/
    │           └── $voteId.tsx         # /bills/:billId/votes/:voteId
    ├── donors/
    │   ├── index.tsx                   # /donors
    │   └── $cmteId.tsx                 # /donors/:cmteId
    └── settings.tsx                    # /settings
```

**Key patterns:**
- `__root.tsx` wraps everything in `AuthProvider`, `AuthModalProvider`, `QueryClientProvider`, and Radix `TooltipProvider`
- `_authenticated.tsx` is a layout route — the underscore prefix means it doesn't add a URL segment but wraps children in auth checks
- `$id.tsx` captures dynamic params — TypeScript knows the param types
- `index.tsx` renders at the bare directory path

**Route generation:** The `@tanstack/router-plugin` Vite plugin watches `src/routes/` and generates `routeTree.gen.ts` automatically.

## Data Fetching Pattern

All server state is managed through TanStack Query hooks in `src/hooks/queries/`:

```
src/hooks/queries/
├── useBills.ts          # useBills(), useBillDetail()
├── usePoliticians.ts    # usePoliticians(), usePoliticianDetail()
├── useDonors.ts         # useDonors(), useDonorDetail()
├── useDashboard.ts      # useDashboard(), useFollowPolitician(), ...
└── useRepresentatives.ts
```

**Query hook pattern:**
```typescript
export function useBills(params: BillSearchParams) {
  return useQuery({
    queryKey: ["bills", params],           // Cache key
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      // ... build query string
      const resp = await apiFetch(`/api/bills?${qs}`);
      return resp.json();
    },
  });
}
```

**Mutation pattern (with cache invalidation):**
```typescript
export function useFollowPolitician() {
  return useMutation({
    mutationFn: async ({ politicianId, follow }) => {
      const resp = await apiFetch(`/api/dashboard/follow/${politicianId}`, {
        method: follow ? "POST" : "DELETE",
      });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "followed"] });
    },
  });
}
```

**QueryClient configuration:**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,         // 2 minutes
      gcTime: 5 * 60 * 1000,            // 5 minutes garbage collection
      retry: 1,                          // Retry failed requests once
      refetchOnWindowFocus: false,       // Don't refetch on tab switch
    },
  },
});
```

## Component Organization

Components are organized by feature, not by type:

```
src/components/
├── auth/               # AuthContext, AuthModalContext, SignIn/SignUp modals
├── bills/              # BillsPage, BillDetailPage, BillCard, BillFilters
├── dashboard/          # DashboardPage, ActivityFeed, FollowedList
├── donors/             # DonorsPage, DonorDetailPage, DonorCard
├── landing/            # LandingPage with tabs
├── layout/             # SidebarLayout, Sidebar
├── representatives/    # RepDetailPage, RepList, VotingRecord
├── settings/           # SettingsPage
├── shared/             # PartyBadge, DotGridBackground
└── ui/                 # Card, Skeleton (design system primitives)
```

## State Management

No global state library (Redux, Zustand). State is distributed:

| Type | Tool | Examples |
|------|------|----------|
| **Server state** | TanStack Query | Bills, politicians, dashboard data |
| **Auth state** | React Context | Current user, session, sign out |
| **Modal state** | React Context | Auth modal open/close |
| **UI state** | `useState` | Filters, tabs, expanded items, search query |
| **Persisted UI** | `localStorage` | Sidebar collapsed, activity last-seen timestamp |
| **URL state** | TanStack Router params | Active tab, route params |

## Design System

The design system is codified in `src/lib/ui.ts` and enforced by convention:

**Color palette** — warm neutrals with a purple accent:
- Page background: `#F5F0E8`
- Text: `#1C1C1A` with opacity modifiers (never `text-gray-*`)
- Accent: `#7B5E8A` (CTAs, active states)
- Error: `#B85C38`
- Success: `#68B085`

**Party colors** (always from `PARTY_STYLES`, never hardcoded):
- Democrat: `#5E85A8`
- Republican: `#A87B7B`
- Independent: `#8A8A7A`

**Typography:**
- Serif (`var(--font-serif)`) for headings, names, bill titles
- Sans (default) for body text
- Mono (`font-mono`) for bill numbers only

**Card component:**
```typescript
<Card padding="lg" border="standard" shadow={true} hoverable={false}>
  {children}
</Card>
```

**Skeleton loading:**
```typescript
<div className="animate-pulse">
  <Skeleton className="h-4 w-24 rounded-full" />
</div>
```

## Loading & Error States

Every data-fetching component follows this pattern:

```typescript
const { data, isLoading, error } = useBills(params);

if (isLoading) return <BillsSkeleton />;
if (error) return <ErrorState onRetry={refetch} />;
if (!data?.bills.length) return <EmptyState />;
return <BillList bills={data.bills} />;
```

- **Loading:** Skeleton placeholders matching the content shape
- **Error:** Centered message with retry button and back navigation
- **Empty:** Card with helpful message and CTA to explore

## Key Utility Files

| File | Purpose |
|------|---------|
| `lib/ui.ts` | Design system constants (colors, card classes, skeleton) |
| `lib/format.ts` | `toTitleCase()`, `formatTotal()`, `formatDate()`, `ordinal()` |
| `lib/topics.ts` | Congress.gov policy area → 12 app topic slugs |
| `lib/bills.ts` | `mapStatus()`, `formatBillId()`, bill type labels |
| `lib/party.ts` | `toParty()`, `partyAbbrev()` |
| `lib/api/fetch.ts` | `apiFetch()` with JWT injection |
| `lib/query-client.ts` | TanStack Query client configuration |

## Money Flow Visualization

The `MoneyFlowSection` component renders a "Follow the Money" flow diagram on the PAC detail page. Three-column horizontal layout on desktop with SVG bezier curves connecting top funders → PAC center node → top recipients. Stroke width and opacity are proportional to donation amounts. Recipients show party badges, spending breakdowns (Direct/IE for/IE against), "Oppose" badges for IE-against spending, and role labels distinguishing current legislators from candidates. Mobile stacks vertically without SVG. See [Money Flow System](../architecture/09-money-flow-system.md) for the full data pipeline.

## Vite Configuration

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    TanStackRouterVite(),    // File-based route generation
    tailwindcss(),           // Tailwind CSS v4
    react(),                 // React fast refresh
  ],
  resolve: {
    alias: { "@": "src" },   // @/ → src/
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

The dev server proxies `/api/*` to FastAPI at localhost:8000, matching the production routing where the SPA and API are on different domains.
