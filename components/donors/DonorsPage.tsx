'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFetchDonors, type ContributorEntry, type ContributorRecipient } from '@/hooks/useFetchDonors'
import { useDebounce } from '@/hooks/useDebounce'
import { PageHeader } from '@/components/layout/PageHeader'
import DataSourceDisclosure from '@/components/shared/DataSourceDisclosure'
import { InfoTooltip } from '@/components/shared/InfoTooltip'
import { PARTY_STYLES } from '@/lib/ui'
import { FEC_DISPLAY_CYCLES } from '@/lib/fec'
import { formatTotal, toTitleCase } from '@/lib/format'
import { partyAbbrev, toParty } from '@/lib/party'

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.025 }}
    >
      <defs>
        <pattern id="topo-donors" x="0" y="0" width="800" height="600" patternUnits="userSpaceOnUse">
          <ellipse cx="400" cy="300" rx="380" ry="260" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="400" cy="300" rx="320" ry="210" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="405" cy="295" rx="260" ry="165" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="410" cy="290" rx="205" ry="125" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="415" cy="285" rx="155" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="418" cy="282" rx="110" ry="62"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="110" cy="500" rx="140" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="115" cy="496" rx="95"  ry="58"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="700" cy="90"  rx="160" ry="100" fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="704" cy="87"  rx="110" ry="65"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="707" cy="85"  rx="65"  ry="38"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo-donors)" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden animate-pulse">
      <div className="p-6 pb-5">
        <div className="flex items-baseline justify-between mb-3">
          <div className="h-7 w-6 bg-[#E8E3DA] rounded" />
          <div className="h-7 w-20 bg-[#E8E3DA] rounded" />
        </div>
        <div className="h-4 bg-[#E8E3DA] rounded w-3/4 mb-2.5" />
        <div className="h-3 bg-[#E8E3DA] rounded w-1/3" />
      </div>
      <div className="bg-[#F5F0E8]/40 px-6 py-5 border-t border-[rgba(28,28,26,0.06)]">
        <div className="h-2.5 bg-[#E8E3DA] rounded w-20 mb-3" />
        <div className="space-y-2.5">
          <div className="h-3.5 bg-[#E8E3DA] rounded w-full" />
          <div className="h-3.5 bg-[#E8E3DA] rounded w-5/6" />
          <div className="h-3.5 bg-[#E8E3DA] rounded w-4/6" />
        </div>
      </div>
    </div>
  )
}

function ContributorCard({ contributor, rank }: { contributor: ContributorEntry; rank: number }) {
  const router = useRouter()

  return (
    <article
      className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden hover:border-[#9B7FA6]/30 hover:shadow-md transition-all cursor-pointer group"
      onClick={() => router.push(`/donors/${contributor.cmteId}`)}
    >
      {/* Header zone */}
      <div className="p-6 pb-5">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <span
            className="text-2xl text-[#1C1C1A]/30 tabular-nums flex-shrink-0"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {rank}
          </span>
          <span
            className="text-2xl text-[#1C1C1A] font-medium tabular-nums flex-shrink-0"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {formatTotal(contributor.totalContributions)}
          </span>
        </div>

        <h2
          className="text-[15px] text-[#1C1C1A] leading-snug mb-2.5 group-hover:text-[#9B7FA6] transition-colors"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {toTitleCase(contributor.cmteName)}
        </h2>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px] text-[#1C1C1A]/50">
            {contributor.recipientCount} candidate{contributor.recipientCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Recipients zone */}
      {contributor.topRecipients.length > 0 && (
        <div className="bg-[#F5F0E8]/40 px-6 py-5 border-t border-[rgba(28,28,26,0.06)]">
          <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-3">Top Recipients</p>
          <div className="grid gap-1.5">
            {contributor.topRecipients.map((r: ContributorRecipient, idx: number) => {
              const p = toParty(r.party)
              const ps = PARTY_STYLES[p]
              return (
                <button
                  key={`${r.bioguideId}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/representatives/${r.bioguideId}`) }}
                  className="w-full grid grid-cols-[1fr_auto] items-center gap-3 hover:bg-white -mx-2 px-2 py-1 rounded-md transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-[#1C1C1A]/75 truncate">{r.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${ps.bg} ${ps.text}`}>
                      {partyAbbrev(p)}-{r.state}
                    </span>
                  </div>
                  <span className="text-sm text-[#1C1C1A]/60 tabular-nums flex-shrink-0 min-w-[56px] text-right">
                    {formatTotal(r.amount)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </article>
  )
}

function DonorsContent() {
  const searchParams = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debouncedQuery = useDebounce(query, 300)

  const {
    contributors, loading, error,
    loadingMore, loadMore, hasMore, refetch,
  } = useFetchDonors(debouncedQuery)

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader title="Donors" />
        <main className="flex-1 px-6 py-10">
          <div className="max-w-2xl mx-auto">

            {/* Page header — landing-scale, centered */}
            <div className="text-center mb-8">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#9B7FA6] bg-[#9B7FA6]/10 border border-[#9B7FA6]/20 px-3 py-1 rounded-full mb-5 tracking-[0.08em] uppercase">
                FEC · {FEC_DISPLAY_CYCLES}
                <InfoTooltip term="fecCycle" />
              </span>
              <h1
                className="text-5xl sm:text-6xl text-[#1C1C1A] mb-4 leading-[1.08] tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
              >
                Top Contributors
              </h1>
              <p className="text-base sm:text-lg text-[#1C1C1A]/55 leading-relaxed max-w-md mx-auto mb-8">
                <em className="not-italic">PACs</em> that spend the most supporting candidates across Congress.
              </p>

              {/* Search input */}
              <div className="flex items-center gap-3 bg-white rounded-lg border border-[rgba(28,28,26,0.12)] px-4 py-3 focus-within:border-[#9B7FA6]/40 transition-colors">
                <span className="text-[#1C1C1A]/35 flex-shrink-0">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search organizations…"
                  className="flex-1 bg-transparent outline-none text-sm text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-[#1C1C1A]/35 hover:text-[#1C1C1A]/60 flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Contributor list */}
            <div>
              {!loading && !error && (
                <p className="text-xs text-[#1C1C1A]/40 mb-4">
                  {contributors.length} organization{contributors.length !== 1 ? 's' : ''}
                </p>
              )}

              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              ) : error ? (
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-12 text-center">
                  <p className="text-[#1C1C1A]/40 text-sm mb-3">Failed to load contributors.</p>
                  <button
                    onClick={() => refetch()}
                    className="text-sm text-[#9B7FA6] hover:text-[#8a6e95]"
                  >
                    Try again
                  </button>
                </div>
              ) : contributors.length === 0 ? (
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-12 text-center">
                  <p className="text-[#1C1C1A]/40 text-sm">No organizations match your search.</p>
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="mt-3 text-sm text-[#9B7FA6] hover:text-[#8a6e95]"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {contributors.map((c, idx) => (
                      <ContributorCard key={c.cmteId} contributor={c} rank={idx + 1} />
                    ))}
                  </div>

                  {hasMore && (
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="mt-4 w-full text-sm font-medium text-[#9B7FA6] hover:text-[#8a6e95] disabled:opacity-50 bg-white border border-[#9B7FA6]/30 rounded-xl px-5 py-3 hover:bg-[#9B7FA6]/5 hover:border-[#9B7FA6]/50 transition-colors"
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
