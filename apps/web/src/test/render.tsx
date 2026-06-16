import { type ReactElement, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Kept intentionally minimal — only the QueryClient. Auth/auth-modal contexts
// are mocked per test file (vi.mock) so we don't load Neon Auth UI under jsdom.
// Tests also mock '@tanstack/react-router' Link to a plain anchor.

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export function renderWithProviders(ui: ReactElement) {
  const client = makeClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, ...render(ui, { wrapper: Wrapper }) };
}
