import { useQuery, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { useAuth } from "@/components/auth/AuthContext";
import type { ActivityItem } from "@/lib/types";

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

const TRACKED_BILLS_KEY = ["dashboard", "tracked-bills"];
const TRACK_BILL_MUTATION_KEY = ["track-bill"];

interface TrackBillVars {
  billId: string;
  track: boolean;
}

export function useTrackedBills() {
  const { user } = useAuth();
  return useQuery({
    queryKey: TRACKED_BILLS_KEY,
    queryFn: () => authFetch("/api/dashboard/tracked-bills"),
    enabled: !!user,
  });
}

export function useTrackBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TRACK_BILL_MUTATION_KEY,
    mutationFn: async ({ billId, track }: TrackBillVars) => {
      const resp = await apiFetch(`/api/dashboard/track/${billId}`, {
        method: track ? "POST" : "DELETE",
      });
      if (!resp.ok) throw new Error("Failed to update track status");
      return resp.json();
    },
    // Returning the refetch keeps the mutation pending until fresh server data
    // lands, so useTrackedBillIds never falls back to a stale list in between.
    onSettled: () => queryClient.invalidateQueries({ queryKey: TRACKED_BILLS_KEY }),
  });
}

/**
 * Tracked bill IDs with in-flight track/untrack toggles applied on top, so the
 * bookmark flips immediately. Pending toggles live in mutation state rather
 * than being written into the shared tracked-bills cache, so the Dashboard
 * never renders partial rows and a failed toggle reverts on its own.
 */
export function useTrackedBillIds(): Set<string> {
  const { data } = useTrackedBills();
  const pending = useMutationState({
    filters: { mutationKey: TRACK_BILL_MUTATION_KEY, status: "pending" },
    select: (mutation) => mutation.state.variables as TrackBillVars,
  });
  const ids = new Set<string>((data?.bills ?? []).map((b: { id: string }) => b.id));
  for (const { billId, track } of pending) {
    if (track) ids.add(billId);
    else ids.delete(billId);
  }
  return ids;
}

export interface ActivityFeedResponse {
  items: ActivityItem[];
  lastSeenAt: string | null;
}

export function useActivityFeed() {
  const { user } = useAuth();
  return useQuery<ActivityFeedResponse>({
    queryKey: ["dashboard", "activity"],
    queryFn: () => authFetch("/api/dashboard/activity"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMarkActivitySeen() {
  return useMutation({
    mutationFn: async () => {
      const resp = await apiFetch("/api/dashboard/activity/seen", { method: "POST" });
      if (!resp.ok) throw new Error("Failed to mark activity seen");
      return resp.json();
    },
  });
}
