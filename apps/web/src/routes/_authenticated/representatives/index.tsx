import { createFileRoute } from "@tanstack/react-router";
import { RepresentativesPage } from "@/components/representatives/RepresentativesPage";
export const Route = createFileRoute("/_authenticated/representatives/")({ component: RepresentativesPage });
