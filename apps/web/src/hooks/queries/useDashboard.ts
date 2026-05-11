// apps/web/src/hooks/queries/useDashboard.ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";

async function authFetch(url: string) {
  const resp = await apiFetch(url);
  if (!resp.ok) throw new Error(`Failed: ${url}`);
  return resp.json();
}

export function useFollowedPoliticians() {
  return useQuery({
    queryKey: ["dashboard", "followed"],
    queryFn: () => authFetch("/api/dashboard/followed"),
  });
}

export function useTrackedBills() {
  return useQuery({
    queryKey: ["dashboard", "tracked-bills"],
    queryFn: () => authFetch("/api/dashboard/tracked-bills"),
  });
}

export function useTopicPreferences() {
  return useQuery({
    queryKey: ["dashboard", "topic-preferences"],
    queryFn: () => authFetch("/api/dashboard/topic-preferences"),
  });
}
