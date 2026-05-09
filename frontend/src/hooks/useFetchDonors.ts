
import { useCallback } from 'react'
import type { Party } from '@/lib/types'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'

const PAGE_SIZE = 20

export interface ContributorRecipient {
  bioguideId: string
  name: string
  party: Party
  state: string
  chamber: string
  amount: number
}

export interface ContributorEntry {
  cmteId: string
  cmteName: string
  rank: number
  directTotal: number
  ieForTotal: number
  ieAgainstTotal: number
  totalContributions: number
  recipientCount: number
  topRecipients: ContributorRecipient[]
}

export function useFetchDonors(debouncedQuery: string) {
  const buildParams = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
      if (debouncedQuery) params.set('q', debouncedQuery)
      return params
    },
    [debouncedQuery]
  )

  const { data, ...rest } = usePaginatedFetch<ContributorEntry>({
    endpoint: '/api/donors',
    buildParams,
    responseKey: 'contributors',
    resetKey: debouncedQuery,
    pageSize: PAGE_SIZE,
    errorFallback: 'Failed to load donors',
  })

  return { contributors: data, ...rest }
}
