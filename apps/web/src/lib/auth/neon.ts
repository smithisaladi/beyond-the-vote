// Neon Auth client — replaces Supabase Auth
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react";

const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL;

if (!neonAuthUrl) {
  throw new Error("Missing VITE_NEON_AUTH_URL");
}

export const auth = createAuthClient(neonAuthUrl, {
  adapter: BetterAuthReactAdapter(),
});

// Convenience exports matching the API surface used by components
export const useSession = auth.adapter.useSession;
export const getJWTToken = auth.getJWTToken;
