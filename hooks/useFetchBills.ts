'use client'

import { useState, useEffect, useCallback } from 'react'

const PAGE_SIZE = 20

export interface Bill {
  id: string
  number: string
  title: string
  sponsor: string
  party: 'Democrat' | 'Republican' | 'Independent'
  status: 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'
  category?: 'Environment' | 'Economy' | 'Healthcare' | 'Defense' | 'Education' | 'Housing' | 'Technology' | 'Immigration'
  lastAction: string
  lastActionTimestamp: number
  summary: string
}

export function useFetchBills(debouncedQuery: string) {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchBills = useCallback(async (currentOffset: number, append: boolean) => {
    if (currentOffset === 0) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) })
    if (debouncedQuery) params.set('q', debouncedQuery)

    try {
      const res = await fetch(`/api/bills?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load bills')
      if (append) {
        setBills(prev => [...prev, ...data.bills])
      } else {
        setBills(data.bills)
      }
      setTotal(data.pagination?.total ?? data.bills.length)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load bills')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [debouncedQuery])

  useEffect(() => {
    setOffset(0)
    fetchBills(0, false)
  }, [debouncedQuery, fetchBills])

  const loadMore = () => {
    const nextOffset = offset + PAGE_SIZE
    setOffset(nextOffset)
    fetchBills(nextOffset, true)
  }

  const hasMore = bills.length < total

  return {
    bills, loading, error, total, loadingMore, loadMore, hasMore,
    refetch: () => fetchBills(0, false),
  }
}
