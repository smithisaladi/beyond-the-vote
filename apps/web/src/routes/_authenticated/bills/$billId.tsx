import { createFileRoute } from "@tanstack/react-router";
import BillDetailPage from "@/components/bills/BillDetailPage";
export const Route = createFileRoute("/_authenticated/bills/$billId")({
  component: () => {
    const { billId } = Route.useParams();
    return <BillDetailPage billId={billId} />;
  },
});
