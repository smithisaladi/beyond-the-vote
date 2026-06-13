import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const RepresentativesPage = lazy(() => import("@/components/representatives/RepresentativesPage"));

export const Route = createFileRoute("/_authenticated/representatives/")({ component: RepresentativesPage });
