import { createFileRoute } from "@tanstack/react-router";
import RepresentativeDetailPage from "@/components/representatives/RepresentativeDetailPage";
export const Route = createFileRoute("/_authenticated/representatives/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <RepresentativeDetailPage bioguideId={id} />;
  },
});
