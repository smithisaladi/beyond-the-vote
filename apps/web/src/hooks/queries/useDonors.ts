// apps/web/src/hooks/queries/useDonors.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";

export function useDonors(params: { q?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["donors", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.q) searchParams.set("q", params.q);
      searchParams.set("limit", String(params.limit || 20));
      searchParams.set("offset", String(params.offset || 0));
      const resp = await apiFetch(`/api/donors?${searchParams}`);
      if (!resp.ok) throw new Error("Failed to fetch donors");
      return resp.json();
    },
  });
}

export function usePacDetail(cmteId: string) {
  return useQuery({
    queryKey: ["pac", cmteId],
    queryFn: async () => {
      const resp = await apiFetch(`/api/donors/${cmteId}`);
      if (!resp.ok) throw new Error("PAC not found");
      return resp.json();
    },
    enabled: !!cmteId,
  });
}

export function useGeneratePacSummary(cmteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const resp = await apiFetch(`/api/donors/${cmteId}/summary`, {
        method: "POST",
      });
      if (!resp.ok) throw new Error("Failed to generate summary");
      return resp.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["pac", cmteId], (old: any) =>
        old ? { ...old, summary: data.summary } : old
      );
    },
  });
}
