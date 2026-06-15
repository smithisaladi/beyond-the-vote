import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { activityResponse } from "@/test/fixtures";

vi.mock("@/components/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.c" }, loading: false }),
}));
vi.mock("@/lib/auth/neon", () => ({
  authClient: { getSession: async () => ({ data: null }) },
}));

import { useActivityFeed } from "@/hooks/queries/useDashboard";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useActivityFeed (network integration)", () => {
  it("fetches the activity feed through apiFetch + MSW", async () => {
    server.use(
      http.get("*/api/dashboard/activity", () => HttpResponse.json(activityResponse)),
    );
    const { result } = renderHook(() => useActivityFeed(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(2);
    expect(result.current.data?.items[0].action).toBe("voted Yea");
  });
});
