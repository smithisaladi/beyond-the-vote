'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Party, BillStatus } from '@/lib/types'

const PAGE_SIZE = 20

export interface BillFilters {
  statuses?: string[]
  topics?: string[]
  dateFilter?: 'all' | 'month' | 'year'
  sort?: 'newest' | 'oldest'
  trackedBillIds?: string[]
}

export interface Bill {
  id: string
  number: string
  title: string
  sponsor: string
  party: Party
  status: BillStatus
  topics: string[]
  lastAction: string
  lastActionTimestamp: number
  summary: string
}

export function useFetchBills(debouncedQuery: string, filters?: BillFilters) {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const statusKey = filters?.statuses?.slice().sort().join(',') ?? ''
  const topicsKey = filters?.topics?.slice().sort().join(',') ?? ''
  const dateKey = filters?.dateFilter ?? 'all'
  const sortKey = filters?.sort ?? 'newest'
  const billIdsKey = filters?.trackedBillIds?.slice().sort().join(',') ?? ''

  const fetchBills = useCallback(async (currentOffset: number, append: boolean, signal?: AbortSignal) => {
    if (currentOffset === 0) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) })
    if (debouncedQuery) params.set('q', debouncedQuery)
    if (statusKey) params.set('status', statusKey)
    if (topicsKey) params.set('topics', topicsKey)
    if (dateKey && dateKey !== 'all') params.set('date', dateKey)
    if (sortKey && sortKey !== 'newest') params.set('sort', sortKey)
    if (billIdsKey) params.set('billIds', billIdsKey)

    try {
      const res = await fetch(`/api/bills?${params.toString()}`, { signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load bills')
      if (append) {
        setBills(prev => [...prev, ...data.bills])
      } else {
        setBills(data.bills)
      }
      setTotal(data.pagination?.total ?? data.bills.length)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load bills')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [debouncedQuery, statusKey, topicsKey, dateKey, sortKey, billIdsKey])

  useEffect(() => {
    const controller = new AbortController()
    setOffset(0)
    fetchBills(0, false, controller.signal)
    return () => controller.abort()
  }, [debouncedQuery, statusKey, topicsKey, dateKey, sortKey, billIdsKey, fetchBills])

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
