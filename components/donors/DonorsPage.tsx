'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFetchDonors, type ContributorEntry, type ContributorRecipient } from '@/hooks/useFetchDonors'
import { useDebounce } from '@/hooks/useDebounce'
import { PageHeader } from '@/components/layout/PageHeader'
import DataSourceDisclosure from '@/components/shared/DataSourceDisclosure'
import { PARTY_STYLES } from '@/lib/ui'
import { FEC_DISPLAY_CYCLES } from '@/lib/fec'
import type { Party } from '@/lib/types'

function formatTotal(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function formatAmount(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function partyAbbrev(party: Party): string {
  if (party === 'Democrat') return 'D'
  if (party === 'Republican') return 'R'
  return 'I'
}

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.04 }}
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
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-4 w-6 bg-[#E8E3DA] rounded" />
        <div className="h-5 w-16 bg-[#E8E3DA] rounded" />
      </div>
      <div className="h-5 bg-[#E8E3DA] rounded w-3/4 mb-2" />
      <div className="h-3.5 bg-[#E8E3DA] rounded w-1/3 mb-5" />
      <div className="space-y-2.5">
        <div className="h-3.5 bg-[#E8E3DA] rounded w-full" />
        <div className="h-3.5 bg-[#E8E3DA] rounded w-5/6" />
        <div className="h-3.5 bg-[#E8E3DA] rounded w-4/6" />
      </div>
    </div>
  )
}

function ContributorCard({ contributor, rank }: { contributor: ContributorEntry; rank: number }) {
  const router = useRouter()
  const party = (p: string): Party => {
    if (p === 'Democrat' || p === 'Republican' || p === 'Independent') return p
    return 'Independent'
  }

  return (
    <article
      className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => router.push(`/donors/${contributor.cmteId}`)}
    >
      {/* Top row: rank + total */}
      <div className="flex items-start justify-between mb-2">
        <span className="font-mono text-sm text-[#1C1C1A]/30">#{rank}</span>
        <span
          className="text-base text-[#1C1C1A]/80 font-medium tabular-nums"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {formatTotal(contributor.totalContributions)}
        </span>
      </div>

      {/* PAC name */}
      <h2
        className="text-base text-[#1C1C1A] leading-snug mb-1 group-hover:text-[#9B7FA6] transition-colors"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {contributor.cmteName}
      </h2>

      {/* Recipient count + spending breakdown */}
      <p className="text-sm text-[#1C1C1A]/50 mb-4">
        Supporting {contributor.recipientCount} candidate{contributor.recipientCount !== 1 ? 's' : ''}
        {(contributor.directTotal > 0 || contributor.ieForTotal > 0) && (
          <span className="text-[#1C1C1A]/35">
            {' '}·{contributor.directTotal > 0 ? ` ${formatTotal(contributor.directTotal)} direct` : ''}
            {contributor.directTotal > 0 && contributor.ieForTotal > 0 ? ',' : ''}
            {contributor.ieForTotal > 0 ? ` ${formatTotal(contributor.ieForTotal)} IE` : ''}
          </span>
        )}
      </p>

      {/* Top recipients */}
      {contributor.topRecipients.length > 0 && (
        <div className="border-t border-[rgba(28,28,26,0.06)] pt-3.5">
          <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-2.5">Top Recipients</p>
          <div className="space-y-2">
            {contributor.topRecipients.map((r: ContributorRecipient, idx: number) => {
              const p = party(r.party)
              const ps = PARTY_STYLES[p]
              return (
                <button
                  key={`${r.bioguideId}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/representatives/${r.bioguideId}`) }}
                  className="w-full flex items-center justify-between gap-3 hover:bg-[#F5F0E8]/60 -mx-1.5 px-1.5 py-0.5 rounded transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-[#1C1C1A]/70 truncate">{r.name}</span>
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${ps.bg} ${ps.text}`}>
                      {partyAbbrev(p)}-{r.state}
                    </span>
                  </div>
                  <span className="text-sm text-[#1C1C1A]/50 tabular-nums flex-shrink-0">
                    {formatAmount(r.amount)}
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

            {/* Page header */}
            <div className="mb-8">
              <h1
                className="text-4xl text-[#1C1C1A] mb-1.5 tracking-tight text-center"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                Top Contributors
              </h1>
              <p className="text-sm text-[#1C1C1A]/50 mb-6 text-center">
                PACs that spend the most supporting candidates across Congress.
              </p>

              {/* Search input */}
              <div className="flex items-center gap-3 bg-white rounded-lg border border-[rgba(28,28,26,0.15)] px-4 py-3 shadow-sm">
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
                  {contributors.length} organization{contributors.length !== 1 ? 's' : ''} · FEC {FEC_DISPLAY_CYCLES}
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
                    <div className="mt-6 text-center">
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="text-sm text-[#9B7FA6] hover:text-[#8a6e95] disabled:opacity-50 border border-[#9B7FA6]/30 rounded-lg px-5 py-2.5 hover:bg-[#9B7FA6]/5 transition-colors"
                      >
                        {loadingMore ? 'Loading…' : 'Load more'}
                      </button>
                    </div>
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
