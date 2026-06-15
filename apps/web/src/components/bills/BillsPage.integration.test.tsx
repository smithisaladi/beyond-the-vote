import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/render";
import { billsResponse, emptyBillsResponse } from "@/test/fixtures";

// Render <Link> as a plain anchor — no router needed.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

// Logged-in user so the page's auth-gated bits render.
vi.mock("@/components/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.c" }, loading: false }),
}));

// Stub the auth-modal context so we don't load the real Neon Auth UI modals.
vi.mock("@/components/auth/AuthModalContext", () => ({
  useAuthModal: () => ({
    openSignIn: vi.fn(), openSignUp: vi.fn(), closeModal: vi.fn(),
    isSignInOpen: false, isSignUpOpen: false,
  }),
}));

// Stub the Neon auth client so apiFetch's getSession() resolves to "no token"
// instead of hitting the live Neon endpoint (an unhandled real network call
// that MSW flags). Requests then go out token-less, exactly as in prod.
vi.mock("@/lib/auth/neon", () => ({
  authClient: { getSession: async () => ({ data: null }) },
}));

import BillsPage from "./BillsPage";

describe("BillsPage search", () => {
  it("sends the typed query and renders results", async () => {
    let requestedQ: string | null = null;
    server.use(
      http.get("*/api/bills", ({ request }) => {
        const url = new URL(request.url);
        requestedQ = url.searchParams.get("q");
        // tracked-bills is also fetched; only answer the bills list here.
        return HttpResponse.json(requestedQ ? billsResponse : emptyBillsResponse);
      }),
      http.get("*/api/dashboard/tracked-bills", () => HttpResponse.json({ bills: [] })),
    );

    renderWithProviders(<BillsPage />);
    const input = await screen.findByPlaceholderText(/search bills/i);
    await userEvent.type(input, "water");

    await waitFor(() => {
      expect(screen.getByText("Clean Water Restoration Act")).toBeInTheDocument();
    });
    expect(requestedQ).toBe("water");
  });

  it("shows an empty state when no bills match", async () => {
    server.use(
      http.get("*/api/bills", () => HttpResponse.json(emptyBillsResponse)),
      http.get("*/api/dashboard/tracked-bills", () => HttpResponse.json({ bills: [] })),
    );
    renderWithProviders(<BillsPage />);
    await waitFor(() => {
      expect(screen.queryByText("Clean Water Restoration Act")).not.toBeInTheDocument();
    });
  });
});
