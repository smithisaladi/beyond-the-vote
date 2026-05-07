'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { Party } from '@/lib/types'

export interface PacDetailRecipient {
  bioguideId: string
  name: string
  party: Party
  state: string
  chamber: string
  amount: number
  direct: number
  ieFor: number
}

export interface PacDetail {
  cmteId: string
  name: string
  connectedOrg: string | null
  totalContributions: number
  directTotal: number
  ieForTotal: number
  ieAgainstTotal: number
  recipientCount: number
  recipients: PacDetailRecipient[]
  summary: string
}

type PacBase = Omit<PacDetail, 'summary'> & { summary?: string }

export function useFetchPacDetail(cmteId: string) {
  const pacQuery = useQuery<PacBase, Error>({
    queryKey: queryKeys.donors.detail(cmteId),
    queryFn: async () => {
      const res = await fetch(`/api/donors/${encodeURIComponent(cmteId)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load PAC details')
      return data
    },
    enabled: !!cmteId,
  })

  const summaryQuery = useQuery<string, Error>({
    queryKey: queryKeys.donors.summary(cmteId),
    queryFn: async () => {
      const res = await fetch(`/api/donors/${encodeURIComponent(cmteId)}?summary=1`)
      const data = await res.json()
      if (!res.ok || !data.summary) return ''
      return data.summary
    },
    enabled: !!pacQuery.data,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const pac: PacDetail | null = pacQuery.data
    ? { ...pacQuery.data, summary: summaryQuery.data ?? pacQuery.data.summary ?? '' }
    : null

  return {
    pac,
    loading: pacQuery.isLoading,
    summaryLoading: summaryQuery.isLoading,
    error: pacQuery.error?.message ?? null,
  }
}
