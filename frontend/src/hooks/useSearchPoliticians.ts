
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { Representative } from '@/hooks/useFetchRepresentatives'
import { useDebounce } from '@/hooks/useDebounce'

export function useSearchPoliticians(query: string): {
  results: Representative[]
  loading: boolean
  error: string | null
} {
  const debouncedQuery = useDebounce(query, 300)

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.politicians.search(debouncedQuery),
    queryFn: async () => {
      const res = await fetch(`/api/politicians/search?q=${encodeURIComponent(debouncedQuery)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      return (data.politicians ?? []) as Representative[]
    },
    enabled: debouncedQuery.length >= 3,
    staleTime: 30 * 1000,
  })

  return {
    results: data ?? [],
    loading: isLoading && debouncedQuery.length >= 3,
    error: error instanceof Error ? error.message : null,
  }
}
