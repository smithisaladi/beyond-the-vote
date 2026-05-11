import { createFileRoute } from "@tanstack/react-router";
import DonorsPage from "@/components/donors/DonorsPage";
export const Route = createFileRoute("/_authenticated/donors/")({ component: DonorsPage });
