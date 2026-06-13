import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const SettingsPage = lazy(() => import("@/components/settings/SettingsPage"));

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });
