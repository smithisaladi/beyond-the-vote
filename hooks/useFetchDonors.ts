'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Party } from '@/lib/types'

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
  const [contributors, setContributors] = useState<ContributorEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchDonors = useCallback(async (currentOffset: number, append: boolean, signal?: AbortSignal) => {
    if (currentOffset === 0) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) })
    if (debouncedQuery) params.set('q', debouncedQuery)

    try {
      const res = await fetch(`/api/donors?${params.toString()}`, { signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load donors')
      if (append) {
        setContributors(prev => [...prev, ...data.contributors])
      } else {
        setContributors(data.contributors)
      }
      setTotal(data.pagination?.total ?? data.contributors.length)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load donors')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [debouncedQuery])

  useEffect(() => {
    const controller = new AbortController()
    setOffset(0)
    fetchDonors(0, false, controller.signal)
    return () => controller.abort()
  }, [debouncedQuery, fetchDonors])

  const loadMore = () => {
    const nextOffset = offset + PAGE_SIZE
    setOffset(nextOffset)
    fetchDonors(nextOffset, true)
  }

  const hasMore = contributors.length < total

  return {
    contributors, loading, error, total, loadingMore, loadMore, hasMore,
    refetch: () => fetchDonors(0, false),
  }
}
