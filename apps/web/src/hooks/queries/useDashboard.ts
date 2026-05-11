// apps/web/src/hooks/queries/useDashboard.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/auth/supabase";

async function authFetch(url: string) {
  const { data } = await supabase.auth.getSession();
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${data.session?.access_token}` },
  });
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
