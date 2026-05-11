import { createFileRoute } from "@tanstack/react-router";
import VoteBreakdownPage from "@/components/bills/VoteBreakdownPage";

export const Route = createFileRoute(
  "/_authenticated/bills/$billId/votes/$voteId"
)({
  component: () => {
    const { billId, voteId } = Route.useParams();
    return <VoteBreakdownPage billId={billId} voteId={voteId} />;
  },
});
