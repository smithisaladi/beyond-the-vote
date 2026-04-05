'use client'

import Link from 'next/link'
import { formatBillId, type SmartSearchResult } from '@/lib/bills'

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SmartCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 animate-pulse">
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="h-4 w-16 bg-[#E8E3DA] rounded-full" />
          <div className="h-4 w-20 bg-[#E8E3DA] rounded-full" />
        </div>
        <div className="h-5 bg-[#E8E3DA] rounded w-3/4" />
        <div className="h-4 bg-[#E8E3DA] rounded w-full" />
        <div className="h-4 bg-[#E8E3DA] rounded w-2/3" />
        <div className="flex items-center gap-2 pt-1">
          <div className="h-1.5 w-24 bg-[#E8E3DA] rounded-full" />
          <div className="h-3 w-8 bg-[#E8E3DA] rounded" />
        </div>
      </div>
    </div>
  )
}

// ─── Ordinal helper ────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

// ─── Single result card ───────────────────────────────────────────────────────

function SmartResultCard({ result }: { result: SmartSearchResult }) {
  const pct = Math.round(result.similarity * 100)
  const shortSummary = result.summary
    ? result.summary.length > 150
      ? result.summary.slice(0, 150) + '…'
      : result.summary
    : null

  return (
    <Link href={`/bills/${result.bill_id}`} className="block group">
      <article className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm hover:shadow-md transition-shadow p-6">
        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-mono text-[#1C1C1A]/40 tracking-wide">
            {formatBillId(result.bill_id)}
          </span>
          <span className="text-xs text-[#1C1C1A]/20">·</span>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#9B7FA6]/[0.08] text-[#9B7FA6]/80">
            {ordinal(result.congress)} Congress
          </span>
        </div>

        {/* Title */}
        <h2
          className="text-lg text-[#1C1C1A] leading-snug mb-2 group-hover:text-[#9B7FA6] transition-colors line-clamp-3"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {result.title}
        </h2>

        {/* Summary */}
        {shortSummary && (
          <p className="text-sm text-[#1C1C1A]/55 leading-relaxed mb-4">
            {shortSummary}
          </p>
        )}

        {/* Relevance bar */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 max-w-[120px] h-1 bg-[#E8E3DA] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#9B7FA6]/50 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-[#1C1C1A]/35">{pct}% match</span>
        </div>
      </article>
    </Link>
  )
}

// ─── Results list ─────────────────────────────────────────────────────────────

interface Props {
  results: SmartSearchResult[]
  loading: boolean
  error: string | null
  query: string
  onSwitchToFilter: () => void
}

export function SmartSearchResults({ results, loading, error, query, onSwitchToFilter }: Props) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SmartCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-[#D6CFC4] p-12 text-center">
        <p className="text-[#1C1C1A]/40 text-sm mb-3">
          Search is temporarily unavailable.
        </p>
        <button
          type="button"
          onClick={onSwitchToFilter}
          className="text-sm text-[#9B7FA6] hover:text-[#8a6e95] transition-colors"
        >
          Try the filter search instead
        </button>
      </div>
    )
  }

  if (query.length >= 3 && results.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#D6CFC4] p-12 text-center">
        <p className="text-[#1C1C1A]/40 text-sm">
          No bills matched your search. Try rephrasing or using broader terms.
        </p>
      </div>
    )
  }

  if (results.length === 0) return null

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#1C1C1A]/40">
        {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
      </p>
      {results.map(r => (
        <SmartResultCard key={r.bill_id} result={r} />
      ))}
    </div>
  )
}
