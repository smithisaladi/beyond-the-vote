import { createRootRoute, Outlet } from "@tanstack/react-router";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { authClient } from "@/lib/auth/neon";
import { AuthProvider } from "@/components/auth/AuthContext";
import { AuthModalProvider } from "@/components/auth/AuthModalContext";

export const Route = createRootRoute({
  component: () => (
    <NeonAuthUIProvider authClient={authClient as any}>
      <TooltipProvider>
        <AuthProvider>
          <AuthModalProvider>
            <Outlet />
          </AuthModalProvider>
        </AuthProvider>
      </TooltipProvider>
    </NeonAuthUIProvider>
  ),
});
