import { createFileRoute } from "@tanstack/react-router";
import { BillsPage } from "@/components/bills/BillsPage";
export const Route = createFileRoute("/_authenticated/bills/")({ component: BillsPage });
