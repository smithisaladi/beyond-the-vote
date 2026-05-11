import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";

export function useSearchPoliticians(query: string) {
  return useQuery({
    queryKey: ["politicians-search", query],
    queryFn: async () => {
      const resp = await apiFetch(`/api/politicians/search?q=${encodeURIComponent(query)}`);
      if (!resp.ok) throw new Error("Search failed");
      const data = await resp.json();
      return data.politicians || [];
    },
    enabled: query.length >= 2,
  });
}

export function usePoliticianDetail(bioguideId: string) {
  return useQuery({
    queryKey: ["politician", bioguideId],
    queryFn: async () => {
      const resp = await apiFetch(`/api/politicians/${bioguideId}`);
      if (!resp.ok) throw new Error("Politician not found");
      const data = await resp.json();
      return data.politician || data;
    },
    enabled: !!bioguideId,
  });
}
