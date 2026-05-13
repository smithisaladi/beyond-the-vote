# Phase 5+6: Vite SPA Port + Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the entire Next.js frontend to a Vite SPA with TanStack Router + TanStack Query, connecting to FastAPI via openapi-fetch, then cut over from the old deployment.

**Architecture:** Copy existing React components from the Next.js app into `apps/web/src/`, replacing Next.js-specific imports (next/link, next/image, next/navigation) with TanStack Router equivalents. Data fetching hooks are rewritten to use openapi-fetch against the FastAPI backend instead of direct Supabase queries. Auth uses Supabase JS client-side only (no middleware, no SSR). All routing via TanStack Router file-based routes.

**Tech Stack:** Vite, React 19, TanStack Router, TanStack Query, openapi-fetch, Tailwind 4, Supabase JS (auth only), Sentry

**Design spec:** `docs/superpowers/specs/2026-05-10-full-stack-refactor-design.md`

**Source components:** Existing Next.js app at repo root (`components/`, `hooks/`, `lib/`)

---

## Porting Strategy

The existing 53 components are mostly `'use client'` React components that work in any React app. The migration is:

1. **Copy** component files from `components/` → `apps/web/src/components/`
2. **Replace imports**: `next/link` → TanStack `<Link>`, `next/image` → `<img>`, `next/navigation` → TanStack Router hooks
3. **Replace data fetching**: Supabase client calls → openapi-fetch calls to FastAPI
4. **Replace auth**: Server-side auth checks → client-side Supabase session + route guards

Most components need only import path changes. The hooks need more significant rewrites since they switch from Supabase SDK to openapi-fetch.

---

## Task 1: SPA infrastructure (Router + Query + API client)

**Files:**
- Create: `apps/web/src/lib/api/client.ts`
- Create: `apps/web/src/lib/query-client.ts`
- Create: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/index.tsx`
- Create: `apps/web/src/routeTree.gen.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install TanStack Router plugin**

Add to `apps/web/package.json` dependencies:
```json
"@tanstack/react-router": "^1.120.3",
"@tanstack/router-devtools": "^1.120.3",
"@tanstack/router-plugin": "^1.120.3"
```

Add to `apps/web/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
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

- [ ] **Step 2: Create API client**

```typescript
// apps/web/src/lib/api/client.ts
import createClient from "openapi-fetch";
import { supabase } from "@/lib/auth/supabase";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Create a typed API client
// Types will be generated via `pnpm codegen` from FastAPI's OpenAPI schema
// For now, use untyped client
export const api = createClient({ baseUrl: API_BASE });

// Add auth header middleware
api.use({
  async onRequest({ request }) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      request.headers.set("Authorization", `Bearer ${data.session.access_token}`);
    }
    return request;
  },
});
```

- [ ] **Step 3: Create query client**

```typescript
// apps/web/src/lib/query-client.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000,    // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

- [ ] **Step 4: Create root route**

```tsx
// apps/web/src/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  ),
});
```

- [ ] **Step 5: Create index route**

```tsx
// apps/web/src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div>
      <h1>Beyond the Ballot</h1>
      <p>Political transparency app</p>
    </div>
  );
}
```

- [ ] **Step 6: Update main.tsx with router + query**

```tsx
// apps/web/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {import.meta.env.DEV && <ReactQueryDevtools />}
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 7: Install deps and verify**

```bash
cd apps/web && pnpm install && pnpm dev
```

Expected: Vite dev server on localhost:5173, shows "Beyond the Ballot" with TanStack Router devtools.

- [ ] **Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat(web): SPA infrastructure — TanStack Router + Query + openapi-fetch client"
```

---

## Task 2: Copy design system + UI primitives

**Files:**
- Copy: `lib/ui.ts` → `apps/web/src/lib/ui.ts`
- Copy: `lib/format.ts` → `apps/web/src/lib/format.ts`
- Copy: `lib/constants.ts` → `apps/web/src/lib/constants.ts`
- Copy: `lib/party.ts` → `apps/web/src/lib/party.ts`
- Copy: `lib/ideology.ts` → `apps/web/src/lib/ideology.ts`
- Copy: `lib/topics.ts` → `apps/web/src/lib/topics.ts`
- Copy: `lib/bills.ts` → `apps/web/src/lib/bills.ts`
- Copy: `lib/types/` → `apps/web/src/lib/types/`
- Copy: `components/ui/Card.tsx` → `apps/web/src/components/ui/Card.tsx`
- Copy: `components/ui/Skeleton.tsx` → `apps/web/src/components/ui/Skeleton.tsx`
- Copy: `components/shared/PartyBadge.tsx` → `apps/web/src/components/shared/PartyBadge.tsx`

- [ ] **Step 1: Copy utility files**

Copy all framework-agnostic utility files. These need zero changes:

```bash
cd /Users/smithi/Desktop/beyond-the-vote
# Utilities
cp lib/ui.ts apps/web/src/lib/ui.ts
cp lib/format.ts apps/web/src/lib/format.ts
cp lib/constants.ts apps/web/src/lib/constants.ts
cp lib/party.ts apps/web/src/lib/party.ts
cp lib/ideology.ts apps/web/src/lib/ideology.ts
cp lib/topics.ts apps/web/src/lib/topics.ts
cp lib/bills.ts apps/web/src/lib/bills.ts

# Types
mkdir -p apps/web/src/lib/types
cp lib/types/*.ts apps/web/src/lib/types/
```

- [ ] **Step 2: Copy UI primitives**

```bash
mkdir -p apps/web/src/components/ui apps/web/src/components/shared
cp components/ui/Card.tsx apps/web/src/components/ui/Card.tsx
cp components/ui/Skeleton.tsx apps/web/src/components/ui/Skeleton.tsx
cp components/shared/PartyBadge.tsx apps/web/src/components/shared/PartyBadge.tsx
```

Remove any `'use client'` directives (not needed in Vite — everything is client). Remove any `next/image` or `next/link` imports if present.

- [ ] **Step 3: Set up Tailwind**

Create `apps/web/src/index.css`:
```css
@import "tailwindcss";
```

Import it in `apps/web/src/main.tsx` (add at top):
```typescript
import "./index.css";
```

- [ ] **Step 4: Set up fonts**

Create `apps/web/public/fonts/` directory and add font CSS. Or use Google Fonts CDN — add to `apps/web/index.html`:

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Beyond the Ballot</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --font-serif: 'Fraunces', serif;
      --font-sans: 'Inter', sans-serif;
    }
    body { font-family: var(--font-sans); }
  </style>
</head>
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): design system, UI primitives, Tailwind, fonts"
```

---

## Task 3: Layout + Auth provider

**Files:**
- Create: `apps/web/src/components/layout/SidebarLayout.tsx`
- Create: `apps/web/src/components/layout/AppSidebar.tsx`
- Create: `apps/web/src/components/auth/AuthContext.tsx`
- Create: `apps/web/src/routes/_authenticated.tsx`

- [ ] **Step 1: Create auth context**

```tsx
// apps/web/src/components/auth/AuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/auth/supabase";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null, user: null, loading: true, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

- [ ] **Step 2: Copy and adapt sidebar components**

Copy `components/layout/AppSidebar.tsx` and `components/layout/SidebarLayout.tsx` to `apps/web/src/components/layout/`. In both files:

1. Remove `'use client'` directive
2. Replace `import { usePathname } from "next/navigation"` with `import { useLocation } from "@tanstack/react-router"`
3. Replace `usePathname()` calls with `useLocation().pathname`
4. Replace `import Link from "next/link"` with `import { Link } from "@tanstack/react-router"`
5. Replace `<Link href="/bills">` with `<Link to="/bills">`

- [ ] **Step 3: Create authenticated layout route**

```tsx
// apps/web/src/routes/_authenticated.tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarLayout } from "@/components/layout/SidebarLayout";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <SidebarLayout>
      <Outlet />
    </SidebarLayout>
  );
}
```

- [ ] **Step 4: Update root route to include AuthProvider**

```tsx
// apps/web/src/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "@/components/auth/AuthContext";

export const Route = createRootRoute({
  component: () => (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  ),
});
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): layout, sidebar, auth provider, route guards"
```

---

## Task 4: Data fetching hooks (rewrite for FastAPI)

**Files:**
- Create: `apps/web/src/hooks/queries/useBills.ts`
- Create: `apps/web/src/hooks/queries/usePoliticians.ts`
- Create: `apps/web/src/hooks/queries/useDonors.ts`
- Create: `apps/web/src/hooks/queries/useDashboard.ts`
- Create: `apps/web/src/hooks/queries/useRepresentatives.ts`

- [ ] **Step 1: Create bills hooks**

```typescript
// apps/web/src/hooks/queries/useBills.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export function useBills(params: {
  q?: string; status?: string; topics?: string; sort?: string;
  limit?: number; offset?: number;
}) {
  return useQuery({
    queryKey: ["bills", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.q) searchParams.set("q", params.q);
      if (params.status) searchParams.set("status", params.status);
      if (params.topics) searchParams.set("topics", params.topics);
      if (params.sort) searchParams.set("sort", params.sort);
      searchParams.set("limit", String(params.limit || 20));
      searchParams.set("offset", String(params.offset || 0));
      const resp = await fetch(`/api/bills?${searchParams}`);
      if (!resp.ok) throw new Error("Failed to fetch bills");
      return resp.json();
    },
  });
}

export function useBillDetail(billId: string) {
  return useQuery({
    queryKey: ["bill", billId],
    queryFn: async () => {
      const resp = await fetch(`/api/bills/${billId}`);
      if (!resp.ok) throw new Error("Bill not found");
      return resp.json();
    },
    enabled: !!billId,
  });
}

export function useBillsByTopic(slug: string, limit = 20) {
  return useQuery({
    queryKey: ["bills-by-topic", slug],
    queryFn: async () => {
      const resp = await fetch(`/api/bills/by-topic?slug=${slug}&limit=${limit}`);
      if (!resp.ok) throw new Error("Failed to fetch bills by topic");
      return resp.json();
    },
    enabled: !!slug,
  });
}
```

- [ ] **Step 2: Create politicians hooks**

```typescript
// apps/web/src/hooks/queries/usePoliticians.ts
import { useQuery } from "@tanstack/react-query";

export function useSearchPoliticians(query: string) {
  return useQuery({
    queryKey: ["politicians-search", query],
    queryFn: async () => {
      const resp = await fetch(`/api/politicians/search?q=${encodeURIComponent(query)}`);
      if (!resp.ok) throw new Error("Search failed");
      return resp.json();
    },
    enabled: query.length >= 2,
  });
}

export function usePoliticianDetail(bioguideId: string) {
  return useQuery({
    queryKey: ["politician", bioguideId],
    queryFn: async () => {
      const resp = await fetch(`/api/politicians/${bioguideId}`);
      if (!resp.ok) throw new Error("Politician not found");
      return resp.json();
    },
    enabled: !!bioguideId,
  });
}
```

- [ ] **Step 3: Create donors hooks**

```typescript
// apps/web/src/hooks/queries/useDonors.ts
import { useQuery } from "@tanstack/react-query";

export function useDonors(params: { q?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["donors", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.q) searchParams.set("q", params.q);
      searchParams.set("limit", String(params.limit || 20));
      searchParams.set("offset", String(params.offset || 0));
      const resp = await fetch(`/api/donors?${searchParams}`);
      if (!resp.ok) throw new Error("Failed to fetch donors");
      return resp.json();
    },
  });
}

export function usePacDetail(cmteId: string) {
  return useQuery({
    queryKey: ["pac", cmteId],
    queryFn: async () => {
      const resp = await fetch(`/api/donors/${cmteId}`);
      if (!resp.ok) throw new Error("PAC not found");
      return resp.json();
    },
    enabled: !!cmteId,
  });
}
```

- [ ] **Step 4: Create dashboard hooks**

```typescript
// apps/web/src/hooks/queries/useDashboard.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/auth/supabase";

async function authFetch(url: string) {
  const { data } = await supabase.auth.getSession();
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${data.session?.access_token}` },
  });
  if (!resp.ok) throw new Error(`Failed: ${url}`);
  return resp.json();
}

export function useFollowedPoliticians() {
  return useQuery({
    queryKey: ["dashboard", "followed"],
    queryFn: () => authFetch("/api/dashboard/followed"),
  });
}

export function useTrackedBills() {
  return useQuery({
    queryKey: ["dashboard", "tracked-bills"],
    queryFn: () => authFetch("/api/dashboard/tracked-bills"),
  });
}

export function useTopicPreferences() {
  return useQuery({
    queryKey: ["dashboard", "topic-preferences"],
    queryFn: () => authFetch("/api/dashboard/topic-preferences"),
  });
}
```

- [ ] **Step 5: Create representatives hooks**

```typescript
// apps/web/src/hooks/queries/useRepresentatives.ts
import { useQuery } from "@tanstack/react-query";

export function useRepresentatives(address: string) {
  return useQuery({
    queryKey: ["representatives", address],
    queryFn: async () => {
      const resp = await fetch(`/api/representatives?address=${encodeURIComponent(address)}`);
      if (!resp.ok) throw new Error("Lookup failed");
      return resp.json();
    },
    enabled: address.length >= 5,
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/
git commit -m "feat(web): data fetching hooks for FastAPI (bills, politicians, donors, dashboard, reps)"
```

---

## Task 5: Port page components (bills, politicians, donors)

**Files:**
- Copy+adapt: `components/bills/` → `apps/web/src/components/bills/`
- Copy+adapt: `components/representatives/` → `apps/web/src/components/representatives/`
- Copy+adapt: `components/donors/` → `apps/web/src/components/donors/`
- Copy+adapt: `components/dashboard/` → `apps/web/src/components/dashboard/`
- Copy+adapt: `components/landing/` → `apps/web/src/components/landing/`
- Copy+adapt: `components/settings/` → `apps/web/src/components/settings/`
- Copy+adapt: `components/auth/` → `apps/web/src/components/auth/`

- [ ] **Step 1: Bulk copy all component directories**

```bash
cd /Users/smithi/Desktop/beyond-the-vote
for dir in bills representatives donors dashboard landing settings feedback; do
  cp -r components/$dir apps/web/src/components/$dir
done
# Auth components (modals)
cp components/auth/SignInModal.tsx apps/web/src/components/auth/SignInModal.tsx
cp components/auth/SignUpModal.tsx apps/web/src/components/auth/SignUpModal.tsx
# Shared components
cp components/shared/DataSourceDisclosure.tsx apps/web/src/components/shared/DataSourceDisclosure.tsx
cp components/shared/DotGridBackground.tsx apps/web/src/components/shared/DotGridBackground.tsx
cp components/shared/InfoTooltip.tsx apps/web/src/components/shared/InfoTooltip.tsx
```

- [ ] **Step 2: Global find-and-replace in apps/web/src/components/**

Run these replacements across ALL copied files:

1. Remove `'use client';\n` or `"use client";\n` from all files
2. Replace `import Link from "next/link"` → `import { Link } from "@tanstack/react-router"`
3. Replace `import Image from "next/image"` → remove (use `<img>` tags)
4. Replace `<Image src=` → `<img src=` and remove `width`, `height`, `fill` props
5. Replace `import { usePathname } from "next/navigation"` → `import { useLocation } from "@tanstack/react-router"`
6. Replace `import { useRouter } from "next/navigation"` → `import { useNavigate } from "@tanstack/react-router"`
7. Replace `usePathname()` → `useLocation().pathname`
8. Replace `router.push(` → `navigate({ to: `
9. Replace `<Link href=` → `<Link to=`
10. Replace `import { useSearchParams } from "next/navigation"` → `import { useSearch } from "@tanstack/react-router"`
11. Replace `@/components/` → `@/components/` (same — path alias preserved)
12. Replace `@/lib/` → `@/lib/` (same)
13. Replace `@/hooks/` → `@/hooks/` (same — but hook internals changed in Task 4)

- [ ] **Step 3: Update hook imports in components**

Replace old hook imports with new ones:
- `import { useFetchBills } from "@/hooks/useFetchBills"` → `import { useBills } from "@/hooks/queries/useBills"`
- `import { useFetchBillDetail } from "@/hooks/useFetchBillDetail"` → `import { useBillDetail } from "@/hooks/queries/useBills"`
- `import { useFetchPoliticianDetail } from "@/hooks/useFetchPoliticianDetail"` → `import { usePoliticianDetail } from "@/hooks/queries/usePoliticians"`
- `import { useFetchDonors } from "@/hooks/useFetchDonors"` → `import { useDonors } from "@/hooks/queries/useDonors"`
- `import { useFetchPacDetail } from "@/hooks/useFetchPacDetail"` → `import { usePacDetail } from "@/hooks/queries/useDonors"`
- `import { useFetchRepresentatives } from "@/hooks/useFetchRepresentatives"` → `import { useRepresentatives } from "@/hooks/queries/useRepresentatives"`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(web): port all page components from Next.js (bulk copy + adapt)"
```

---

## Task 6: Route definitions

**Files:**
- Create: `apps/web/src/routes/_authenticated/bills/index.tsx`
- Create: `apps/web/src/routes/_authenticated/bills/$billId.tsx`
- Create: `apps/web/src/routes/_authenticated/representatives/index.tsx`
- Create: `apps/web/src/routes/_authenticated/representatives/$id.tsx`
- Create: `apps/web/src/routes/_authenticated/donors/index.tsx`
- Create: `apps/web/src/routes/_authenticated/donors/$cmteId.tsx`
- Create: `apps/web/src/routes/_authenticated/settings.tsx`
- Modify: `apps/web/src/routes/index.tsx`

- [ ] **Step 1: Create route files**

Each route file is a thin wrapper that renders the corresponding component:

```tsx
// apps/web/src/routes/_authenticated/bills/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { BillsPage } from "@/components/bills/BillsPage";

export const Route = createFileRoute("/_authenticated/bills/")({
  component: BillsPage,
});
```

```tsx
// apps/web/src/routes/_authenticated/bills/$billId.tsx
import { createFileRoute } from "@tanstack/react-router";
import { BillDetailPage } from "@/components/bills/BillDetailPage";

export const Route = createFileRoute("/_authenticated/bills/$billId")({
  component: () => {
    const { billId } = Route.useParams();
    return <BillDetailPage billId={billId} />;
  },
});
```

```tsx
// apps/web/src/routes/_authenticated/representatives/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { RepresentativesPage } from "@/components/representatives/RepresentativesPage";

export const Route = createFileRoute("/_authenticated/representatives/")({
  component: RepresentativesPage,
});
```

```tsx
// apps/web/src/routes/_authenticated/representatives/$id.tsx
import { createFileRoute } from "@tanstack/react-router";
import { RepresentativeDetailPage } from "@/components/representatives/RepresentativeDetailPage";

export const Route = createFileRoute("/_authenticated/representatives/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <RepresentativeDetailPage bioguideId={id} />;
  },
});
```

```tsx
// apps/web/src/routes/_authenticated/donors/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { DonorsPage } from "@/components/donors/DonorsPage";

export const Route = createFileRoute("/_authenticated/donors/")({
  component: DonorsPage,
});
```

```tsx
// apps/web/src/routes/_authenticated/donors/$cmteId.tsx
import { createFileRoute } from "@tanstack/react-router";
import { PacDetailPage } from "@/components/donors/PacDetailPage";

export const Route = createFileRoute("/_authenticated/donors/$cmteId")({
  component: () => {
    const { cmteId } = Route.useParams();
    return <PacDetailPage cmteId={cmteId} />;
  },
});
```

```tsx
// apps/web/src/routes/_authenticated/settings.tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});
```

Update the home route to conditionally show landing or dashboard:

```tsx
// apps/web/src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthContext";
import { LandingPage } from "@/components/landing/LandingPage";
import { DashboardPage } from "@/components/dashboard/DashboardPage";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  return user ? <DashboardPage /> : <LandingPage />;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/routes/
git commit -m "feat(web): TanStack Router route definitions for all pages"
```

---

## Task 7: Sentry + Vercel deployment

**Files:**
- Modify: `apps/web/src/main.tsx` — add Sentry init
- Create: `apps/web/vercel.json`
- Modify: `apps/web/package.json` — add Sentry dependency

- [ ] **Step 1: Add Sentry**

Add to `apps/web/package.json` dependencies:
```json
"@sentry/react": "^8.0.0"
```

Update `apps/web/src/main.tsx` — add Sentry init before router creation:
```typescript
import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}
```

- [ ] **Step 2: Create Vercel config**

```json
// apps/web/vercel.json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The SPA rewrite rule ensures all routes are handled by the client-side router.

- [ ] **Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat(web): Sentry error tracking + Vercel deployment config"
```

---

## Task 8: Phase 6 — Cutover preparation

**Files:**
- Modify: `apps/web/vercel.json`
- Create: `docs/cutover-checklist.md`

- [ ] **Step 1: Create cutover checklist**

```markdown
# Cutover Checklist

## Pre-cutover
- [ ] Run `pnpm build` in apps/web — verify zero errors
- [ ] Run full test suite: `cd apps/api && uv run pytest tests/ -v`
- [ ] Run pipeline test suite: `cd pipeline && uv run pytest tests/ -v`
- [ ] Verify FastAPI deployed on Render and /healthz returns 200
- [ ] Verify Vite SPA builds and renders on Vercel preview
- [ ] Test auth flow: sign up, sign in, sign out
- [ ] Test all routes: bills, politicians, donors, dashboard, settings, representatives
- [ ] Verify OpenAPI schema: `curl http://api-url/openapi.json | jq .paths | wc -l`

## Cutover steps
1. Deploy Vite SPA to Vercel production
2. Update DNS / Vercel project settings to point to new SPA
3. Verify all routes work on production URL
4. Decommission old Next.js Vercel deployment (delete or pause)

## Post-cutover
- [ ] Verify Sentry receiving events from new SPA
- [ ] Verify FastAPI logs in Render dashboard
- [ ] Monitor error rates for 24 hours
- [ ] Remove old Next.js code from repo (Phase 6 cleanup PR)

## Cleanup (separate PR)
- Remove: `app/`, `components/`, `hooks/`, `lib/` (root-level Next.js code)
- Remove: `middleware.ts`, `next.config.ts`, `next-env.d.ts`
- Remove: Next.js dependencies from root `package.json`
- Keep: `pipeline/`, `apps/`, `docs/`, `supabase/`, `e2e/`
```

- [ ] **Step 2: Commit**

```bash
git add docs/cutover-checklist.md
git commit -m "docs: cutover checklist for Phase 6 DNS switch"
```

---

## Parallel execution map

```
Task 1 (SPA infra) ──► Task 3 (layout + auth) ──► Task 6 (routes)
                   └──► Task 2 (design system)          │
                   └──► Task 4 (data hooks)              │
                                                         ▼
Task 5 (port components) ──────────────────────► Task 6 (routes)
                                                         │
                                                         ▼
                                                   Task 7 (Sentry + Vercel)
                                                         │
                                                         ▼
                                                   Task 8 (cutover checklist)
```

**Tasks 2, 3, 4** can run in parallel after Task 1.

**Task 5** can start after Task 2 (needs UI primitives in place).

**Task 6** depends on Tasks 3, 4, 5 (needs layout, hooks, and components).

**Tasks 7, 8** are sequential at the end.
