

import { Suspense } from 'react'
import { useAuthModal } from '@/components/auth/AuthModalContext'
import { useAuth } from '@/components/auth/AuthContext'
// TODO: port useBillFilters hook — using inline state for now
import { useBills } from '@/hooks/queries/useBills'
import { useTrackedBills } from '@/hooks/queries/useDashboard'
import { topicToSlug } from '@/lib/topics'
import { PageHeader } from '@/components/layout/PageHeader'
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { BillSearchBar } from '@/components/bills/BillSearchBar'
import { BillFilters as BillFiltersComponent } from '@/components/bills/BillFilters'
import { BillGrid } from '@/components/bills/BillGrid'

function BillsContent() {
  const { user } = useAuth()
  const { openSignIn } = useAuthModal()
  const filters = useBillFilters()

  const {
    query, setQuery, debouncedQuery,
    selectedStatuses, selectedTopics,
    dateFilter, sort, showTrackedOnly, clearAll,
  } = filters

  const { trackedBills, toggleTrack: _toggleTrack } = useTrackedBills(user?.id ?? null)

  const topicSlugs = selectedTopics.size > 0 ? Array.from(selectedTopics).map(topicToSlug) : undefined
  const fetchFilters: BillFiltersType = {
    statuses: selectedStatuses.size > 0 ? Array.from(selectedStatuses) : undefined,
    topics: topicSlugs,
    dateFilter: dateFilter,
    sort: debouncedQuery ? undefined : sort,
    trackedBillIds: showTrackedOnly && trackedBills.size > 0 ? Array.from(trackedBills) : undefined,
  }

  const {
    bills, loading: billsLoading, error: billsError,
    loadingMore, loadMore, hasMore, refetch,
  } = useBills(debouncedQuery, fetchFilters)

  const handleToggleTrack = (billId: string) => {
    if (!user) { openSignIn(); return }
    _toggleTrack(billId)
  }

  const handleClearFiltersFromGrid = () => {
    clearAll()
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
                filters={filters}
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
