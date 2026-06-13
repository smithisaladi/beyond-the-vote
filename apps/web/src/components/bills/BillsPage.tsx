

import { Suspense, useState, useRef, useCallback, useEffect } from 'react'
import { useAuthModal } from '@/components/auth/AuthModalContext'
import { useAuth } from '@/components/auth/AuthContext'
import { useDebounce } from '@/hooks/useDebounce'
import { useBills } from '@/hooks/queries/useBills'
import { useTrackedBills, useTrackBill } from '@/hooks/queries/useDashboard'
import { topicToSlug } from '@/lib/topics'
import { PageTransition } from '@/components/ui/motion'
import { BillSearchBar } from '@/components/bills/BillSearchBar'
import { BillFilters as BillFiltersComponent } from '@/components/bills/BillFilters'
import { BillGrid } from '@/components/bills/BillGrid'

function BillsContent() {
  const { user } = useAuth()
  const { openSignIn } = useAuthModal()

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set())
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set())
  const [dateFilter, setDateFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [showTrackedOnly, setShowTrackedOnly] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
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

  const toggleStatus = useCallback((s: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }, [])

  const toggleTopic = useCallback((t: string) => {
    setSelectedTopics(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }, [])

  const hasFilters = selectedStatuses.size > 0 || selectedTopics.size > 0 || dateFilter !== 'all' || showTrackedOnly
  const clearAll = useCallback(() => {
    setSelectedStatuses(new Set())
    setSelectedTopics(new Set())
    setDateFilter('all')
    setSort('newest')
    setShowTrackedOnly(false)
  }, [])

  const filters = {
    query, setQuery, debouncedQuery,
    selectedStatuses, toggleStatus,
    selectedTopics, toggleTopic,
    dateFilter, setDateFilter,
    sort, setSort,
    showTrackedOnly, setShowTrackedOnly: (fn: (prev: boolean) => boolean) => setShowTrackedOnly(fn),
    hasFilters, clearAll,
    openDropdown, setOpenDropdown,
    dropdownRef,
  }

  const { data: trackedData } = useTrackedBills()
  const trackMutation = useTrackBill()
  const trackedBills = new Set<string>((trackedData?.bills ?? []).map((b: { id: string }) => b.id))

  const statusParam = selectedStatuses.size > 0 ? [...selectedStatuses].join(',') : undefined
  const topicsParam = selectedTopics.size > 0 ? [...selectedTopics].map(t => topicToSlug(t as any)).join(',') : undefined

  const [allBills, setAllBills] = useState<{ id: string; number: string | null; title: string; sponsor: string | null; party: string | null; status: string | null; topics: string[]; lastAction: string | null; summary: string | null }[]>([])
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const limit = 20

  useEffect(() => {
    setOffset(0)
    setAllBills([])
    setTotal(0)
  }, [debouncedQuery, statusParam, topicsParam, sort])

  const { data, isLoading: billsLoading, isFetching, error: _billsError, refetch } = useBills({
    q: debouncedQuery || undefined,
    status: statusParam,
    topics: topicsParam,
    sort: debouncedQuery ? undefined : sort,
    limit,
    offset,
  })

  useEffect(() => {
    if (data?.bills) {
      setAllBills(prev => offset === 0 ? data.bills : [...prev, ...data.bills])
      setTotal(data.pagination?.total ?? 0)
    }
  }, [data, offset])

  const bills = allBills
  const billsError = _billsError ? String(_billsError) : null
  const hasMore = offset + limit < total
  const loadingMore = isFetching && offset > 0

  const loadMore = () => {
    setOffset(prev => prev + limit)
  }

  const displayBills = showTrackedOnly ? bills.filter(b => trackedBills.has(b.id)) : bills

  const handleToggleTrack = (billId: string) => {
    if (!user) { openSignIn(); return }
    trackMutation.mutate({ billId, track: !trackedBills.has(billId) })
  }

  return (
    <PageTransition>
    <div className="flex flex-col flex-1 min-h-screen">
      <div className="flex flex-col flex-1">

        <main className="flex-1 px-6 pt-24 pb-8">
          <div className="max-w-4xl mx-auto">

            {/* Page heading */}
            <div className="mb-5 text-center">
              <h1 className="text-[26px] leading-tight font-serif font-semibold text-fg mb-1.5">
                Search Bills
              </h1>
              <p className="text-[13px] text-fg/50">
                Follow legislation that matters to you.
              </p>
            </div>

            {/* Search card */}
            <BillSearchBar query={query} onQueryChange={setQuery} />

              {/* Filter chips */}
              <BillFiltersComponent
                filters={filters}
                user={user}
              />

            {/* Bill list */}
            <BillGrid
              bills={displayBills}
              loading={billsLoading}
              loadingMore={loadingMore}
              error={billsError}
              hasMore={hasMore}
              onLoadMore={loadMore}
              trackedBills={trackedBills}
              onToggleTrack={handleToggleTrack}
              showTrackedOnly={showTrackedOnly}
              onClearFilters={clearAll}
              onRefetch={refetch}
            />
          </div>
        </main>
      </div>
    </div>
    </PageTransition>
  )
}

export default function BillsPage() {
  return (
    <Suspense>
      <BillsContent />
    </Suspense>
  )
}
