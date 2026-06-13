import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";

export function useBills(params: {
  q?: string; status?: string; topics?: string; sort?: string;
  limit?: number; offset?: number;
}) {
  return useQuery({
    queryKey: ["bills", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.q) searchParams.set("q", params.q);
      if (params.status) searchParams.set("status", params.status);
      if (params.topics) searchParams.set("topics", params.topics);
      if (params.sort) searchParams.set("sort", params.sort);
      searchParams.set("limit", String(params.limit || 20));
      searchParams.set("offset", String(params.offset || 0));
      const resp = await apiFetch(`/api/bills?${searchParams}`);
      if (!resp.ok) throw new Error("Failed to fetch bills");
      return resp.json();
    },
  });
}

export function useBillDetail(billId: string) {
  return useQuery({
    queryKey: ["bill", billId],
    queryFn: async () => {
      const resp = await apiFetch(`/api/bills/${billId}`);
      if (!resp.ok) throw new Error("Bill not found");
      const data = await resp.json();
      return data.bill || data;
    },
    enabled: !!billId,
  });
}