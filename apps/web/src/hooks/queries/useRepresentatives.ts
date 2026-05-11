// apps/web/src/hooks/queries/useRepresentatives.ts
import { useQuery } from "@tanstack/react-query";

export function useRepresentatives(address: string) {
  return useQuery({
    queryKey: ["representatives", address],
    queryFn: async () => {
      const resp = await fetch(`/api/representatives?address=${encodeURIComponent(address)}`);
      if (!resp.ok) throw new Error("Lookup failed");
      return resp.json();
    },
    enabled: address.length >= 5,
  });
}
