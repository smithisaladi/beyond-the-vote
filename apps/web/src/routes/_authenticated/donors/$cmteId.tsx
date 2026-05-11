import { createFileRoute } from "@tanstack/react-router";
import PacDetailPage from "@/components/donors/PacDetailPage";
export const Route = createFileRoute("/_authenticated/donors/$cmteId")({
  component: () => {
    const { cmteId } = Route.useParams();
    return <PacDetailPage cmteId={cmteId} />;
  },
});
