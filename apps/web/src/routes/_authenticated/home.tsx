import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const DashboardPage = lazy(() => import("@/components/dashboard/DashboardPage"));

export const Route = createFileRoute("/_authenticated/home")({
  component: DashboardPage,
});
