import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "@/components/auth/AuthContext";

export const Route = createRootRoute({
  component: () => (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  ),
});
