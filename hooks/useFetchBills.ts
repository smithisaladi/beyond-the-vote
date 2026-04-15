'use client'

import { useCallback } from 'react'
import type { Party, BillStatus } from '@/lib/types'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'

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
  const statusKey = filters?.statuses?.slice().sort().join(',') ?? ''
  const topicsKey = filters?.topics?.slice().sort().join(',') ?? ''
  const dateKey = filters?.dateFilter ?? 'all'
  const sortKey = filters?.sort ?? 'newest'
  const billIdsKey = filters?.trackedBillIds?.slice().sort().join(',') ?? ''

  const resetKey = `${debouncedQuery}|${statusKey}|${topicsKey}|${dateKey}|${sortKey}|${billIdsKey}`

  const buildParams = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
      if (debouncedQuery) params.set('q', debouncedQuery)
      if (statusKey) params.set('status', statusKey)
      if (topicsKey) params.set('topics', topicsKey)
      if (dateKey && dateKey !== 'all') params.set('date', dateKey)
      if (sortKey && sortKey !== 'newest') params.set('sort', sortKey)
      if (billIdsKey) params.set('billIds', billIdsKey)
      return params
    },
    [debouncedQuery, statusKey, topicsKey, dateKey, sortKey, billIdsKey]
  )

  const { data, ...rest } = usePaginatedFetch<Bill>({
    endpoint: '/api/bills',
    buildParams,
    responseKey: 'bills',
    resetKey,
    pageSize: PAGE_SIZE,
    errorFallback: 'Failed to load bills',
  })

  return { bills: data, ...rest }
}
