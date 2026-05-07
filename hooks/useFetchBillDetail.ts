'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { BillDetail } from '@/lib/types/bills'

export type {
  BillVote as Vote,
  BillVoteMemberPosition as MemberPosition,
  PartyBreakdown,
  BillDetail,
} from '@/lib/types/bills'

async function fetchBillDetail(id: string): Promise<BillDetail> {
  const res = await fetch(`/api/bills/${id}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to load')
  return data.bill
}

function mergeBillEnrichment(initial: BillDetail, fetched: BillDetail): BillDetail {
  return {
    ...initial,
    cosponsors: fetched.cosponsors?.length > 0 ? fetched.cosponsors : initial.cosponsors,
    topics: fetched.topics?.length > 0 ? fetched.topics : initial.topics,
    subjects: fetched.subjects?.length > 0 ? fetched.subjects : initial.subjects,
    actions: fetched.actions?.length > initial.actions.length ? fetched.actions : initial.actions,
    sponsor: fetched.sponsor ?? initial.sponsor,
    summary: fetched.summary || initial.summary,
    votes: fetched.votes?.length > 0 ? fetched.votes : initial.votes,
  }
}

export function useFetchBillDetail(id: string, initialBill?: BillDetail | null): {
  bill: BillDetail | null
  loading: boolean
  error: string | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.bills.detail(id),
    queryFn: async () => {
      const fetched = await fetchBillDetail(id)
      if (initialBill) return mergeBillEnrichment(initialBill, fetched)
      return fetched
    },
    initialData: initialBill ?? undefined,
    staleTime: initialBill ? 0 : 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!id,
  })

  return {
    bill: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  }
}
