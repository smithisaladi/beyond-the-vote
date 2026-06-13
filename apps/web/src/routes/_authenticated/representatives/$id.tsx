import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const RepresentativeDetailPage = lazy(() => import("@/components/representatives/RepresentativeDetailPage"));

export const Route = createFileRoute("/_authenticated/representatives/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <RepresentativeDetailPage id={id} />;
  },
});
