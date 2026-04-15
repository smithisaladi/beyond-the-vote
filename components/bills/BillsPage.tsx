'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SignInModal } from '@/components/auth/SignInModal'
import { SignUpModal } from '@/components/auth/SignUpModal'
import { useAuth } from '@/hooks/useAuth'
import { useBillFilters } from '@/hooks/useBillFilters'
import { useFetchBills, type BillFilters } from '@/hooks/useFetchBills'
import { useTrackedBills } from '@/hooks/useTrackedBills'
import { useDebounce } from '@/hooks/useDebounce'
import { PageHeader } from '@/components/layout/PageHeader'
import type { BillStatus as Status } from '@/lib/types'
import { topicToSlug, slugToTopic, type Topic } from '@/lib/topics'
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { SEARCH_DEBOUNCE_MS } from '@/lib/constants'
import { BillSearchBar } from '@/components/bills/BillSearchBar'
import { BillFilters as BillFiltersComponent } from '@/components/bills/BillFilters'
import { BillGrid } from '@/components/bills/BillGrid'

type DateFilter = 'all' | 'month' | 'year'
type SortOption = 'newest' | 'oldest'
type DropdownId = 'status' | 'date' | 'topics' | 'sort' | null

function BillsContent() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)

  // ─── Search + filter state (initialize from URL) ────────────────────────────
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS)

  const [openDropdown, setOpenDropdown] = useState<DropdownId>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const initialStatuses = (searchParams.get('status')?.split(',').filter(Boolean) ?? []) as Status[]
  const initialDate = (searchParams.get('date') ?? 'all') as DateFilter

  const {
    selectedStatuses, dateFilter,
    toggleStatus, setDateFilter,
    clearFilters, hasFilters,
  } = useBillFilters({ statuses: initialStatuses, dateFilter: initialDate })

  // Initialize from URL params
  const [showTrackedOnly, setShowTrackedOnly] = useState(searchParams.get('tracked') === 'true')
  const [selectedTopics, setSelectedTopics] = useState<Set<Topic>>(() => {
    const t = searchParams.get('topics')
    if (!t) return new Set()
    return new Set(t.split(',').filter(Boolean).map(slugToTopic).filter(Boolean) as Topic[])
  })
  const [sort, setSort] = useState<SortOption>(() => {
    const s = searchParams.get('sort')
    return s === 'oldest' ? 'oldest' : 'newest'
  })

  const { trackedBills, toggleTrack: _toggleTrack } = useTrackedBills(user?.id ?? null)

  const topicSlugs = selectedTopics.size > 0 ? Array.from(selectedTopics).map(topicToSlug) : undefined
  const filters: BillFilters = {
    statuses: selectedStatuses.size > 0 ? Array.from(selectedStatuses) : undefined,
    topics: topicSlugs,
    dateFilter: dateFilter,
    sort: debouncedQuery ? undefined : sort,
    trackedBillIds: showTrackedOnly && trackedBills.size > 0 ? Array.from(trackedBills) : undefined,
  }

  const {
    bills, loading: billsLoading, error: billsError,
    loadingMore, loadMore, hasMore, refetch,
  } = useFetchBills(debouncedQuery, filters)

  // Sync all filter state to URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (selectedStatuses.size > 0) params.set('status', Array.from(selectedStatuses).join(','))
    if (selectedTopics.size > 0) params.set('topics', Array.from(selectedTopics).map(topicToSlug).join(','))
    if (dateFilter !== 'all') params.set('date', dateFilter)
    if (sort !== 'newest') params.set('sort', sort)
    if (showTrackedOnly) params.set('tracked', 'true')
    const qs = params.toString()
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`
    if (newUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', newUrl)
    }
  }, [query, selectedStatuses, selectedTopics, dateFilter, sort, showTrackedOnly])

  const toggleTopic = (topic: Topic) => {
    setSelectedTopics(prev => {
      const next = new Set(prev)
      next.has(topic) ? next.delete(topic) : next.add(topic)
      return next
    })
  }

  const handleToggleTrack = (billId: string) => {
    if (!user) { setAuthModal('signin'); return }
    _toggleTrack(billId)
  }

  const handleClearAll = () => {
    clearFilters()
    setQuery('')
    setShowTrackedOnly(false)
    setSelectedTopics(new Set())
    setSort('newest')
  }

  const handleClearFiltersFromGrid = () => {
    setQuery('')
    clearFilters()
    setShowTrackedOnly(false)
    setSelectedTopics(new Set())
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-bills" />

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader title="Bills Tracker" />
        <main className="flex-1 px-6 pt-24 pb-8">
          <div className="max-w-4xl mx-auto">

            {/* Page heading */}
            <div className="mb-5 text-center">
              <h1
                className="text-2xl sm:text-3xl text-[#1C1C1A] mb-1.5"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
              >
                Search Bills
              </h1>
              <p className="text-sm text-[#1C1C1A]/50">
                Follow legislation that matters to you.
              </p>
            </div>

            {/* Search card */}
            <BillSearchBar query={query} onQueryChange={setQuery} />

              {/* Filter chips */}
              <BillFiltersComponent
                selectedStatuses={selectedStatuses}
                toggleStatus={toggleStatus}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                selectedTopics={selectedTopics}
                toggleTopic={toggleTopic}
                sort={sort}
                setSort={setSort}
                showTrackedOnly={showTrackedOnly}
                setShowTrackedOnly={setShowTrackedOnly}
                debouncedQuery={debouncedQuery}
                hasFilters={hasFilters}
                clearAll={handleClearAll}
                openDropdown={openDropdown}
                setOpenDropdown={setOpenDropdown}
                dropdownRef={dropdownRef}
                user={user}
              />

            {/* Bill list */}
            <BillGrid
              bills={bills}
              loading={billsLoading}
              loadingMore={loadingMore}
              error={billsError}
              hasMore={hasMore}
              onLoadMore={loadMore}
              trackedBills={trackedBills}
              onToggleTrack={handleToggleTrack}
              showTrackedOnly={showTrackedOnly}
              onClearFilters={handleClearFiltersFromGrid}
              onRefetch={refetch}
            />
          </div>
        </main>
      </div>

      <SignInModal
        isOpen={authModal === 'signin'}
        onClose={() => setAuthModal(null)}
        onSwitchToSignUp={() => setAuthModal('signup')}
      />
      <SignUpModal
        isOpen={authModal === 'signup'}
        onClose={() => setAuthModal(null)}
        onSwitchToSignIn={() => setAuthModal('signin')}
      />
    </div>
  )
}

export default function BillsPage() {
  return (
    <Suspense>
      <BillsContent />
    </Suspense>
  )
}
