import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const BillDetailPage = lazy(() => import("@/components/bills/BillDetailPage"));

export const Route = createFileRoute("/_authenticated/bills/$billId/")({
  component: () => {
    const { billId } = Route.useParams();
    return <BillDetailPage id={billId} />;
  },
});
