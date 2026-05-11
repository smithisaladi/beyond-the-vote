

import { useState, Suspense } from 'react'
import { Link } from '@tanstack/react-router'
import { useSearch } from '@tanstack/react-router'
import { useDonors } from '@/hooks/queries/useDonors'
// TODO: define ContributorEntry and ContributorRecipient types properly
type ContributorEntry = any
type ContributorRecipient = any
import { useDebounce } from '@/hooks/useDebounce'
import { PageHeader } from '@/components/layout/PageHeader'
import DataSourceDisclosure from '@/components/shared/DataSourceDisclosure'
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { InfoTooltip } from '@/components/shared/InfoTooltip'
import { FEC_DISPLAY_CYCLES } from '@/lib/fec'
import { formatTotal } from '@/lib/format'
import { PARTY_STYLES } from '@/lib/ui'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

type Lean = { label: string; party: 'Democrat' | 'Republican' | null; pct: number }

function computeLean(recipients: ContributorRecipient[]): Lean | null {
  if (recipients.length === 0) return null
  let demTotal = 0, repTotal = 0
  for (const r of recipients) {
    if (r.party === 'Democrat') demTotal += r.amount
    else if (r.party === 'Republican') repTotal += r.amount
  }
  const total = demTotal + repTotal
  if (total === 0) return null
  const demPct = demTotal / total
  const repPct = repTotal / total
  if (demPct >= 0.65) return { label: 'Leans Democrat', party: 'Democrat', pct: Math.round(demPct * 100) }
  if (repPct >= 0.65) return { label: 'Leans Republican', party: 'Republican', pct: Math.round(repPct * 100) }
  return { label: 'Mixed', party: null, pct: Math.round(Math.max(demPct, repPct) * 100) }
}

function LeanPill({ lean }: { lean: Lean }) {
  if (lean.party) {
    const style = PARTY_STYLES[lean.party]
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.hex }} />
        {lean.label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#8A8A7A]/[0.12] text-[#8A8A7A]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#8A8A7A]" />
      {lean.label}
    </span>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24"="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function CardSkeleton() {
  return (
    <Card padding="none" className="p-5 animate-pulse">
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-baseline gap-3">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-24 mb-3 ml-7" />
      <div className="border-t border-[rgba(28,28,26,0.06)] pt-3 ml-7 space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-4/6" />
      </div>
    </Card>
  )
}

function ContributorCard({ contributor, rank }: { contributor: ContributorEntry; rank: number }) {
  const lean = computeLean(contributor.topRecipients)

  return (
    <Link to={`/donors/${contributor.cmteId}`} className="block group">
      <Card as="article" hoverable className="cursor-pointer">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Rank + Name */}
            <div className="flex items-baseline gap-2.5 mb-1">
              <span className="text-xs font-mono text-[#1C1C1A]/30 flex-shrink-0">#{rank}</span>
              <h2
                className="text-lg text-[#1C1C1A] leading-snug group-hover:text-[#7B5E8A] transition-colors"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {contributor.cmteName}
              </h2>
            </div>
            <span className="text-xs text-[#1C1C1A]/38 pl-7">
              {contributor.recipientCount} candidate{contributor.recipientCount !== 1 ? 's' : ''} supported
            </span>
          </div>

          {/* Total + lean pill */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span
              className="text-xl text-[#1C1C1A] font-medium tabular-nums text-right"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {formatTotal(contributor.totalContributions)}
            </span>
            {lean && <LeanPill lean={lean} />}
          </div>
        </div>
      </Card>
    </Link>
  )
}

function DonorsContent() {
  const searchParams = useSearch({ strict: false }) as Record<string, string>

  const [query, setQuery] = useState(searchParams['q'] ?? '')
  const debouncedQuery = useDebounce(query, 300)

  const { data, isLoading: loading, error: _donorError, refetch } = useDonors({ q: debouncedQuery })
  const contributors = data ?? []
  const error = _donorError ? String(_donorError) : null
  // TODO: port pagination
  const loadingMore = false
  const loadMore = () => {}
  const hasMore = false

  return (
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-donors" />

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader title="Donors" />
        <main className="flex-1 px-6 pt-24 pb-8">
          <div className="max-w-4xl mx-auto">

            {/* Page heading */}
            <div className="mb-5 text-center">
              <h1
                className="text-2xl sm:text-3xl text-[#1C1C1A] mb-1.5"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
              >
                Top Contributors
              </h1>
              <p className="text-sm text-[#1C1C1A]/50">
                PACs that spend the most supporting candidates across Congress.
                <span className="inline-flex items-center ml-1.5 text-xs text-[#1C1C1A]/38">
                  FEC · {FEC_DISPLAY_CYCLES}
                  <InfoTooltip term="fecCycle" />
                </span>
              </p>
            </div>

            {/* Search card */}
            <Card padding="none">
              <div className="flex items-center px-5 py-4 gap-3">
                <span className="text-[#1C1C1A]/25 flex-shrink-0">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search organizations…"
                  className="flex-1 bg-transparent outline-none text-[15px] text-[#1C1C1A] placeholder:text-[#1C1C1A]/35"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-[#1C1C1A]/35 hover:text-[#1C1C1A]/60 flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24"="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </Card>

            {/* Contributor list */}
            <div className="mt-8">

              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              ) : error ? (
                <Card padding="xl" className="text-center">
                  <p className="text-[#1C1C1A]/40 text-sm mb-3">Failed to load contributors.</p>
                  <button
                    onClick={() => refetch()}
                    className="text-sm text-[#7B5E8A] hover:text-[#6A4F78]"
                  >
                    Try again
                  </button>
                </Card>
              ) : contributors.length === 0 ? (
                <Card padding="xl" className="text-center">
                  <p className="text-[#1C1C1A]/40 text-sm">No organizations match your search.</p>
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="mt-3 text-sm text-[#7B5E8A] hover:text-[#6A4F78]"
                    >
                      Clear search
                    </button>
                  )}
                </Card>
              ) : (
                <>
                  <div className="space-y-4">
                    {contributors.map((c) => (
                      <ContributorCard key={c.cmteId} contributor={c} rank={c.rank} />
                    ))}
                  </div>

                  {hasMore && (
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="mt-4 w-full text-sm font-medium text-[#7B5E8A] hover:text-[#6A4F78] disabled:opacity-50 bg-white border border-[#7B5E8A]/30 rounded-xl px-5 py-3 hover:bg-[#7B5E8A]/5 hover:border-[#7B5E8A]/50 transition-colors"
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                </>
              )}
            </div>

            <DataSourceDisclosure className="mt-10" />
          </div>
        </main>
      </div>
    </div>
  )
}

export default function DonorsPage() {
  return (
    <Suspense>
      <DonorsContent />
    </Suspense>
  )
}
