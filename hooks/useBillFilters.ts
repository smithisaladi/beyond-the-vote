'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDebounce } from './useDebounce'
import { useUrlState } from './useUrlState'
import { topicToSlug, slugToTopic, type Topic } from '@/lib/topics'
import type { BillStatus as Status } from '@/lib/types'
import { SEARCH_DEBOUNCE_MS } from '@/lib/constants'

export type DateFilter = 'all' | 'month' | 'year'
export type SortOption = 'newest' | 'oldest'
export type DropdownId = 'status' | 'date' | 'topics' | 'sort' | null

export interface BillFiltersState {
  // Search
  query: string
  setQuery: (q: string) => void
  debouncedQuery: string

  // Status
  selectedStatuses: Set<Status>
  toggleStatus: (s: Status) => void

  // Date
  dateFilter: DateFilter
  setDateFilter: (d: DateFilter) => void

  // Topics
  selectedTopics: Set<Topic>
  toggleTopic: (t: Topic) => void

  // Sort
  sort: SortOption
  setSort: (s: SortOption) => void

  // Tracked
  showTrackedOnly: boolean
  setShowTrackedOnly: (fn: boolean | ((prev: boolean) => boolean)) => void

  // Dropdown
  openDropdown: DropdownId
  setOpenDropdown: (d: DropdownId) => void
  dropdownRef: React.RefObject<HTMLDivElement | null>

  // Derived
  hasFilters: boolean
  clearAll: () => void
}

export function useBillFilters(): BillFiltersState {
  const searchParams = useSearchParams()

  // ─── Search ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS)

  // ─── Dropdown ──────────────────────────────────────────────────────────────
  const [openDropdown, setOpenDropdown] = useState<DropdownId>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ─── Status ────────────────────────────────────────────────────────────────
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(
    () => new Set((searchParams.get('status')?.split(',').filter(Boolean) ?? []) as Status[])
  )
  const toggleStatus = useCallback((s: Status) => {
    setSelectedStatuses(prev => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }, [])

  // ─── Date ──────────────────────────────────────────────────────────────────
  const [dateFilter, setDateFilter] = useState<DateFilter>(
    () => (searchParams.get('date') ?? 'all') as DateFilter
  )

  // ─── Topics ────────────────────────────────────────────────────────────────
  const [selectedTopics, setSelectedTopics] = useState<Set<Topic>>(() => {
    const t = searchParams.get('topics')
    if (!t) return new Set()
    return new Set(t.split(',').filter(Boolean).map(slugToTopic).filter(Boolean) as Topic[])
  })
  const toggleTopic = useCallback((topic: Topic) => {
    setSelectedTopics(prev => {
      const next = new Set(prev)
      next.has(topic) ? next.delete(topic) : next.add(topic)
      return next
    })
  }, [])

  // ─── Sort ──────────────────────────────────────────────────────────────────
  const [sort, setSort] = useState<SortOption>(() => {
    const s = searchParams.get('sort')
    return s === 'oldest' ? 'oldest' : 'newest'
  })

  // ─── Tracked ───────────────────────────────────────────────────────────────
  const [showTrackedOnly, setShowTrackedOnlyRaw] = useState(searchParams.get('tracked') === 'true')
  const setShowTrackedOnly = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setShowTrackedOnlyRaw(v)
  }, [])

  // ─── URL sync ──────────────────────────────────────────────────────────────
  useUrlState({
    q: query || null,
    status: selectedStatuses.size > 0 ? Array.from(selectedStatuses).join(',') : null,
    topics: selectedTopics.size > 0 ? Array.from(selectedTopics).map(topicToSlug).join(',') : null,
    date: dateFilter !== 'all' ? dateFilter : null,
    sort: sort !== 'newest' ? sort : null,
    tracked: showTrackedOnly ? 'true' : null,
  }, [query, selectedStatuses, selectedTopics, dateFilter, sort, showTrackedOnly])

  // ─── Derived ───────────────────────────────────────────────────────────────
  const hasFilters = selectedStatuses.size > 0 || dateFilter !== 'all'

  const clearAll = useCallback(() => {
    setSelectedStatuses(new Set())
    setQuery('')
    setShowTrackedOnlyRaw(false)
    setSelectedTopics(new Set())
    setSort('newest')
    setDateFilter('all')
  }, [])

  return {
    query, setQuery, debouncedQuery,
    selectedStatuses, toggleStatus,
    dateFilter, setDateFilter,
    selectedTopics, toggleTopic,
    sort, setSort,
    showTrackedOnly, setShowTrackedOnly,
    openDropdown, setOpenDropdown, dropdownRef,
    hasFilters, clearAll,
  }
}
