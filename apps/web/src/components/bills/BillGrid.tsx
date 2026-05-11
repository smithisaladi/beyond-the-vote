

import { Link } from '@tanstack/react-router'

// TODO: define Bill type properly
type Bill = any
import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import { slugToTopic } from '@/lib/topics'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? '#7B5E8A' : 'none'} stroke="#7B5E8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function BillCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="flex gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
      </div>
    </Card>
  )
}

function BillCard({
  bill,
  tracked,
  onToggleTrack,
}: {
  bill: Bill
  tracked: boolean
  onToggleTrack: () => void
}) {
  const party = PARTY_STYLES[bill.party] || { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' }
  const status = STATUS_STYLES[bill.status] || { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' }

  return (
    <Link to={`/bills/${bill.id}`} className="block group">
      <Card as="article" hoverable className="cursor-pointer">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Top meta row */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs font-mono text-[#1C1C1A]/40 tracking-wide">{bill.number}</span>
              <span className="text-xs text-[#1C1C1A]/20">·</span>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${status.bg} ${status.text}`}>
                {bill.status}
              </span>
              {bill.topics.length > 0 && (
                <>
                  <span className="text-xs text-[#1C1C1A]/20">·</span>
                  <span className="text-xs font-medium text-[#7B5E8A] bg-[#7B5E8A]/[0.12] px-2.5 py-0.5 rounded-full">
                    {slugToTopic(bill.topics[0]) ?? bill.topics[0]}
                  </span>
                </>
              )}
            </div>

            {/* Title */}
            <h2 className="text-base text-[#1C1C1A] leading-snug mb-2 group-hover:text-[#7B5E8A] transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>
              {bill.title}
            </h2>

            {/* Summary */}
            <p className="text-sm text-[#1C1C1A]/55 leading-relaxed mb-4 line-clamp-2">
              {bill.summary}
            </p>

            {/* Bottom row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#1C1C1A]/60">{bill.sponsor}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${party.bg} ${party.text}`}>
                {bill.party}
              </span>
              {bill.lastAction && (
                <>
                  <span className="text-xs text-[#1C1C1A]/25">·</span>
                  <span className="text-xs text-[#1C1C1A]/40">Last action {bill.lastAction}</span>
                </>
              )}
            </div>
          </div>

          {/* Track button */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleTrack(); }}
            aria-label={tracked ? 'Untrack bill' : 'Track bill'}
            className="flex-shrink-0 p-2 rounded-lg hover:bg-[#7B5E8A]/8 transition-colors mt-0.5"
          >
            <BookmarkIcon filled={tracked} />
          </button>
        </div>
      </Card>
    </Link>
  )
}

interface BillGridProps {
  bills: Bill[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  onLoadMore: () => void
  trackedBills: Set<string>
  onToggleTrack: (billId: string) => void
  showTrackedOnly: boolean
  onClearFilters: () => void
  onRefetch: () => void
}

export function BillGrid({
  bills,
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  trackedBills,
  onToggleTrack,
  showTrackedOnly,
  onClearFilters,
  onRefetch,
}: BillGridProps) {
  return (
    <div>
      <div className="flex-1 min-w-0">
        {/* Result count */}
        {!loading && !error && (
          <p className="text-xs text-[#1C1C1A]/40 mb-4">
            {`${bills.length} bills`}
            {trackedBills.size > 0 && (
              <span className="ml-2 text-[#7B5E8A]">· {trackedBills.size} tracked</span>
            )}
          </p>
        )}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <BillCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <Card shadow={false} padding="xl" className="text-center">
            <p className="text-[#1C1C1A]/40 text-sm mb-3">
              {error.includes('CONGRESS_API_KEY')
                ? 'Congress.gov API key is not configured.'
                : 'Failed to load bills.'}
            </p>
            <button
              onClick={() => onRefetch()}
              className="text-sm text-[#7B5E8A] hover:text-[#6A4F78]"
            >
              Try again
            </button>
          </Card>
        ) : bills.length === 0 ? (
          <Card shadow={false} padding="xl" className="text-center">
            <p className="text-[#1C1C1A]/40 text-sm">
              {showTrackedOnly ? 'You haven\'t tracked any bills yet.' : 'No bills match your filters.'}
            </p>
            <button
              onClick={onClearFilters}
              className="mt-3 text-sm text-[#7B5E8A] hover:text-[#6A4F78]"
            >
              Clear all filters
            </button>
          </Card>
        ) : (
          <>
            <div className="space-y-4">
              {bills.map(bill => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  tracked={trackedBills.has(bill.id)}
                  onToggleTrack={() => onToggleTrack(bill.id)}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="text-sm text-[#7B5E8A] hover:text-[#6A4F78] disabled:opacity-50 border border-[#7B5E8A]/30 rounded-lg px-5 py-2.5 hover:bg-[#7B5E8A]/5 transition-colors"
                >
                  {loadingMore ? 'Loading…' : 'Load more bills'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
