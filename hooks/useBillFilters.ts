'use client'

import { useState } from 'react'
import { useDebounce } from './useDebounce'

type Status = 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'
type Category = 'Environment' | 'Economy' | 'Healthcare' | 'Defense' | 'Education' | 'Housing' | 'Technology' | 'Immigration'
type DateFilter = 'all' | 'month' | 'year'

export function useBillFilters(initial?: { statuses?: Status[], dateFilter?: DateFilter }) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 400)
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(
    () => new Set(initial?.statuses ?? [])
  )
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(new Set())
  const [dateFilter, setDateFilter] = useState<DateFilter>(initial?.dateFilter ?? 'all')

  const toggleStatus = (s: Status) =>
    setSelectedStatuses(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })

  const toggleCategory = (c: Category) =>
    setSelectedCategories(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })

  const clearFilters = () => {
    setSelectedStatuses(new Set())
    setSelectedCategories(new Set())
    setDateFilter('all')
  }

  const hasFilters = selectedStatuses.size > 0 || selectedCategories.size > 0 || dateFilter !== 'all'

  return {
    query, setQuery,
    debouncedQuery,
    selectedStatuses, toggleStatus,
    selectedCategories, toggleCategory,
    dateFilter, setDateFilter,
    clearFilters,
    hasFilters,
  }
}
