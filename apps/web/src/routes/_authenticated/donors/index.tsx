import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const DonorsPage = lazy(() => import("@/components/donors/DonorsPage"));

export const Route = createFileRoute("/_authenticated/donors/")({ component: DonorsPage });
