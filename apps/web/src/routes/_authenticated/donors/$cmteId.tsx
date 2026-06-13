import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const PacDetailPage = lazy(() => import("@/components/donors/PacDetailPage"));

export const Route = createFileRoute("/_authenticated/donors/$cmteId")({
  component: () => {
    const { cmteId } = Route.useParams();
    return <PacDetailPage cmteId={cmteId} />;
  },
});
