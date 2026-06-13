import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const VoteBreakdownPage = lazy(() => import("@/components/bills/VoteBreakdownPage"));

export const Route = createFileRoute(
  "/_authenticated/bills/$billId/votes/$voteId"
)({
  component: () => {
    const { billId, voteId } = Route.useParams();
    return <VoteBreakdownPage billId={billId} voteId={voteId} />;
  },
});
