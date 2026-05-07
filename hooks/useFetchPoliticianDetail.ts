'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { Politician } from '@/lib/types/politicians'

export type {
  Politician,
  PoliticianStats,
  PoliticianVote,
  PoliticianBill,
  DonorAlignment,
  Donor,
  TopContributor,
  Committee,
  FundingBreakdown,
} from '@/lib/types/politicians'

async function fetchPoliticianDetail(id: string): Promise<Politician> {
  const res = await fetch(`/api/politicians/${id}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to load')
  return data.politician
}

function mergePoliticianEnrichment(initial: Politician, fetched: Politician): Politician {
  return {
    ...initial,
    bills: fetched.bills?.length > 0 ? fetched.bills : initial.bills,
    photoCredit: fetched.photoCredit ?? initial.photoCredit,
    votes: fetched.votes?.length > initial.votes.length ? fetched.votes : initial.votes,
  }
}

export function useFetchPoliticianDetail(id: string, initialPolitician?: Politician | null): {
  politician: Politician | null
  loading: boolean
  error: string | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.politicians.detail(id),
    queryFn: async () => {
      const fetched = await fetchPoliticianDetail(id)
      if (initialPolitician) return mergePoliticianEnrichment(initialPolitician, fetched)
      return fetched
    },
    initialData: initialPolitician ?? undefined,
    staleTime: initialPolitician ? 0 : 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!id,
  })

  return {
    politician: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  }
}
