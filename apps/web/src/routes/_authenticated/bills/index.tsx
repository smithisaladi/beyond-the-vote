import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const BillsPage = lazy(() => import("@/components/bills/BillsPage"));

export const Route = createFileRoute("/_authenticated/bills/")({ component: BillsPage });
