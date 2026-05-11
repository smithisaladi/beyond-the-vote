import { createRootRoute, Outlet } from "@tanstack/react-router";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { authClient } from "@/lib/auth/neon";
import { AuthProvider } from "@/components/auth/AuthContext";

export const Route = createRootRoute({
  component: () => (
    <NeonAuthUIProvider authClient={authClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </NeonAuthUIProvider>
  ),
});
