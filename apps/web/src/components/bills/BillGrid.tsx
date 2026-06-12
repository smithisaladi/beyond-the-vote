
import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { Bookmark } from 'lucide-react'
import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import { slugToTopic } from '@/lib/topics'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { StaggerGrid, StaggerItem, TAP_SPRING } from '@/components/ui/motion'

interface Bill {
  id: string
  number: string | null
  title: string
  sponsor: string | null
  party: string | null
  status: string | null
  topics: string[]
  lastAction: string | null
  summary: string | null
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
  const party = PARTY_STYLES[bill.party as keyof typeof PARTY_STYLES] || PARTY_STYLES.Independent
  const status = STATUS_STYLES[bill.status as keyof typeof STATUS_STYLES] || STATUS_STYLES.Committee

  return (
    <Link to="/bills/$billId" params={{ billId: bill.id }} className="block group">
      <Card as="article" hoverable className="cursor-pointer">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Top meta row */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs font-mono text-fg/40 tracking-wide">{bill.number}</span>
              <span className="text-xs text-fg/20">·</span>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${status.bg} ${status.text}`}>
                {bill.status}
              </span>
              {bill.topics.length > 0 && (
                <>
                  <span className="text-xs text-fg/20">·</span>
                  <span className="text-xs font-medium text-accent bg-accent/[0.12] px-2.5 py-0.5 rounded-full">
                    {slugToTopic(bill.topics[0]) ?? bill.topics[0]}
                  </span>
                </>
              )}
            </div>

            {/* Title */}
            <h2 className="text-base text-fg leading-snug mb-2 group-hover:text-accent transition-colors tracking-tight">
              {bill.title}
            </h2>

            {/* Summary */}
            <p className="text-sm text-fg/55 leading-relaxed mb-4 line-clamp-2">
              {bill.summary}
            </p>

            {/* Bottom row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-fg/60">{bill.sponsor}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${party.bg} ${party.text}`}>
                {bill.party}
              </span>
              {bill.lastAction && (
                <>
                  <span className="text-xs text-fg/25">·</span>
                  <span className="text-xs text-fg/40">Last action {bill.lastAction}</span>
                </>
              )}
            </div>
          </div>

          {/* Track button */}
          <motion.button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleTrack(); }}
            aria-label={tracked ? 'Untrack bill' : 'Track bill'}
            {...TAP_SPRING}
            className="flex-shrink-0 p-2 rounded-lg hover:bg-accent/[0.08] transition-colors mt-0.5"
          >
            <Bookmark
              size={18}
              strokeWidth={1.8}
              className={tracked ? 'text-accent' : 'text-fg/45'}
              fill={tracked ? 'currentColor' : 'none'}
            />
          </motion.button>
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

const FIRST_PAGE_SIZE = 20

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
          <p className="text-xs text-fg/40 mb-4">
            {`${bills.length} bills`}
            {trackedBills.size > 0 && (
              <span className="ml-2 text-accent">· {trackedBills.size} tracked</span>
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
          <Card padding="xl" className="text-center">
            <p className="text-fg/40 text-sm mb-3">
              {error.includes('CONGRESS_API_KEY')
                ? 'Congress.gov API key is not configured.'
                : 'Failed to load bills.'}
            </p>
            <button
              onClick={() => onRefetch()}
              className="text-sm text-accent hover:text-accent-deep-hover"
            >
              Try again
            </button>
          </Card>
        ) : bills.length === 0 ? (
          <Card padding="xl" className="text-center">
            <p className="text-fg/40 text-sm">
              {showTrackedOnly ? 'You haven\'t tracked any bills yet.' : 'No bills match your filters.'}
            </p>
            <button
              onClick={onClearFilters}
              className="mt-3 text-sm text-accent hover:text-accent-deep-hover"
            >
              Clear all filters
            </button>
          </Card>
        ) : (
          <>
            {/* First page wrapped in StaggerGrid; subsequent pages rendered plainly */}
            <StaggerGrid className="space-y-4">
              {bills.slice(0, FIRST_PAGE_SIZE).map(bill => (
                <StaggerItem key={bill.id}>
                  <BillCard
                    bill={bill}
                    tracked={trackedBills.has(bill.id)}
                    onToggleTrack={() => onToggleTrack(bill.id)}
                  />
                </StaggerItem>
              ))}
            </StaggerGrid>

            {bills.length > FIRST_PAGE_SIZE && (
              <div className="space-y-4 mt-4">
                {bills.slice(FIRST_PAGE_SIZE).map(bill => (
                  <BillCard
                    key={bill.id}
                    bill={bill}
                    tracked={trackedBills.has(bill.id)}
                    onToggleTrack={() => onToggleTrack(bill.id)}
                  />
                ))}
              </div>
            )}

            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="text-sm text-accent hover:text-accent-deep-hover disabled:opacity-50 border border-accent/30 rounded-lg px-5 py-2.5 hover:bg-accent/[0.05] transition-colors"
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
