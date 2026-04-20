'use client'

import { useState, useEffect } from 'react'
import type { Representative } from '@/hooks/useFetchRepresentatives'
import { useDebounce } from '@/hooks/useDebounce'

export function useSearchPoliticians(query: string): {
  results: Representative[]
  loading: boolean
  error: string | null
} {
  const [results, setResults] = useState<Representative[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    if (debouncedQuery.length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/politicians/search?q=${encodeURIComponent(debouncedQuery)}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Search failed')
        setResults(data.politicians ?? [])
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err.message); setResults([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [debouncedQuery])

  return { results, loading, error }
}
