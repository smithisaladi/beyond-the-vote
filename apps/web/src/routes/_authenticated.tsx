import { createFileRoute, Outlet } from "@tanstack/react-router";
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
