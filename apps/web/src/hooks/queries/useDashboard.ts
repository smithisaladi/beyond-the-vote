// apps/web/src/hooks/queries/useDashboard.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { useAuth } from "@/components/auth/AuthContext";

async function authFetch(url: string) {
  const resp = await apiFetch(url);
  if (!resp.ok) throw new Error(`Failed: ${url}`);
  return resp.json();
}

export function useFollowedPoliticians() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard", "followed"],
    queryFn: () => authFetch("/api/dashboard/followed"),
    enabled: !!user,
  });
}

export function useFollowPolitician() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ politicianId, follow }: { politicianId: string; follow: boolean }) => {
      const resp = await apiFetch(`/api/dashboard/follow/${politicianId}`, {
        method: follow ? "POST" : "DELETE",
      });
      if (!resp.ok) throw new Error("Failed to update follow status");
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "followed"] });
    },
  });
}

export function useTrackedBills() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard", "tracked-bills"],
    queryFn: () => authFetch("/api/dashboard/tracked-bills"),
    enabled: !!user,
  });
}

export function useTrackBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, track }: { billId: string; track: boolean }) => {
      const resp = await apiFetch(`/api/dashboard/track/${billId}`, {
        method: track ? "POST" : "DELETE",
      });
      if (!resp.ok) throw new Error("Failed to update track status");
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "tracked-bills"] });
    },
  });
}

export function useTopicPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard", "topic-preferences"],
    queryFn: () => authFetch("/api/dashboard/topic-preferences"),
    enabled: !!user,
  });
}
