'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { Party } from '@/lib/types'

export interface Representative {
  id: string
  bioguideId: string | null
  name: string
  title: string
  party: Party
  state: string
  district?: string
  photo: string | null
  since: string | null
  website: string | null
  phone: string | null
  ideologyScore?: number | null
}

const ERROR_MESSAGES: Record<string, string> = {
  address_not_found: "We couldn't find that address. Try including your city and zip code.",
  no_legislators: "This address doesn't appear to have voting federal representatives. Some US territories have non-voting delegates.",
  geocode_failed: 'Something went wrong. Please try again.',
}

export function useFetchRepresentatives(address: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.representatives.byAddress(address),
    queryFn: async () => {
      const res = await fetch(`/api/representatives?address=${encodeURIComponent(address)}`)
      const data = await res.json()
      if (data.error) {
        throw new Error(ERROR_MESSAGES[data.error] ?? ERROR_MESSAGES.geocode_failed)
      }
      return (data.representatives ?? []) as Representative[]
    },
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  })

  return {
    representatives: data ?? [],
    loading: isLoading,
    error: error instanceof Error ? error.message : '',
  }
}
