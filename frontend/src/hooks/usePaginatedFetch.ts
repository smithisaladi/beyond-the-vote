
import { useInfiniteQuery } from '@tanstack/react-query'

interface UsePaginatedFetchOptions {
  /** API endpoint path, e.g. '/api/bills'. */
  endpoint: string
  /** Builds the query string for a given offset. Identity is ignored for deps; see `resetKey`. */
  buildParams: (offset: number) => URLSearchParams
  /** Response body field holding the result array (e.g. 'bills', 'contributors'). */
  responseKey: string
  /** Stable serialized key for all inputs feeding `buildParams`. Changing it resets offset to 0. */
  resetKey: string
  /** Page size used for `loadMore` increments. */
  pageSize?: number
  /** Fallback error message if the response is not ok and body has no `.error`. */
  errorFallback?: string
}

interface UsePaginatedFetchResult<T> {
  data: T[]
  loading: boolean
  error: string | null
  total: number
  loadingMore: boolean
  loadMore: () => void
  hasMore: boolean
  refetch: () => Promise<void>
}

interface PageData<T> {
  rows: T[]
  total: number
  nextOffset: number | null
}

/**
 * Generic paginated fetch hook backed by React Query's useInfiniteQuery.
 * Handles offset/total/loadMore state with automatic caching and deduplication.
 * Callers wrap it to expose a domain-specific data key.
 */
export function usePaginatedFetch<T>({
  endpoint,
  buildParams,
  responseKey,
  resetKey,
  pageSize = 20,
  errorFallback = 'Request failed',
}: UsePaginatedFetchOptions): UsePaginatedFetchResult<T> {
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery<PageData<T>, Error>({
    queryKey: [endpoint, resetKey],
    queryFn: async ({ pageParam, signal }) => {
      const offset = pageParam as number
      const params = buildParams(offset)
      const res = await fetch(`${endpoint}?${params.toString()}`, { signal })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? errorFallback)
      const rows: T[] = body[responseKey] ?? []
      const total: number = body.pagination?.total ?? rows.length
      return {
        rows,
        total,
        nextOffset: offset + pageSize < total ? offset + pageSize : null,
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  })

  const allRows = data?.pages.flatMap((p) => p.rows) ?? []
  const total = data?.pages[data.pages.length - 1]?.total ?? 0

  return {
    data: allRows,
    loading: isLoading,
    error: error?.message ?? null,
    total,
    loadingMore: isFetchingNextPage,
    loadMore: () => { if (hasNextPage) fetchNextPage() },
    hasMore: !!hasNextPage,
    refetch: async () => { await refetch() },
  }
}
