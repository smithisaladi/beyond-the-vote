'use client'

import { useCallback, useEffect, useState } from 'react'

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

/**
 * Generic paginated fetch hook. Handles offset/total/loadMore state, AbortController cleanup,
 * and AbortError suppression. Callers wrap it to expose a domain-specific data key.
 */
export function usePaginatedFetch<T>({
  endpoint,
  buildParams,
  responseKey,
  resetKey,
  pageSize = 20,
  errorFallback = 'Request failed',
}: UsePaginatedFetchOptions): UsePaginatedFetchResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = useCallback(
    async (currentOffset: number, append: boolean, signal?: AbortSignal) => {
      if (currentOffset === 0) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      try {
        const params = buildParams(currentOffset)
        const res = await fetch(`${endpoint}?${params.toString()}`, { signal })
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error ?? errorFallback)
        const rows: T[] = body[responseKey] ?? []
        setData(prev => (append ? [...prev, ...rows] : rows))
        setTotal(body.pagination?.total ?? rows.length)
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : errorFallback)
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    // buildParams identity is not stable; we gate re-runs on resetKey instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, responseKey, errorFallback, resetKey]
  )

  useEffect(() => {
    const controller = new AbortController()
    setOffset(0)
    fetchPage(0, false, controller.signal)
    return () => controller.abort()
  }, [fetchPage])

  const loadMore = () => {
    const next = offset + pageSize
    setOffset(next)
    fetchPage(next, true)
  }

  return {
    data,
    loading,
    error,
    total,
    loadingMore,
    loadMore,
    hasMore: data.length < total,
    refetch: () => fetchPage(0, false),
  }
}
