// apps/web/src/hooks/queries/useDonors.ts
import { useQuery } from "@tanstack/react-query";

export function useDonors(params: { q?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["donors", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.q) searchParams.set("q", params.q);
      searchParams.set("limit", String(params.limit || 20));
      searchParams.set("offset", String(params.offset || 0));
      const resp = await fetch(`/api/donors?${searchParams}`);
      if (!resp.ok) throw new Error("Failed to fetch donors");
      return resp.json();
    },
  });
}

export function usePacDetail(cmteId: string) {
  return useQuery({
    queryKey: ["pac", cmteId],
    queryFn: async () => {
      const resp = await fetch(`/api/donors/${cmteId}`);
      if (!resp.ok) throw new Error("PAC not found");
      return resp.json();
    },
    enabled: !!cmteId,
  });
}
