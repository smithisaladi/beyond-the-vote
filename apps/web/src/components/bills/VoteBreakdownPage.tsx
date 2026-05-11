

import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { PARTY_STYLES, getPartyStyle, resultBadge } from '@/lib/ui'
import { formatDate } from '@/lib/format'
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { Card } from '@/components/ui/Card'
import { Skeleton as SkeletonBox } from '@/components/ui/Skeleton'
import { useBillDetail } from '@/hooks/queries/useBills'
interface MemberPosition {
  bioguideId: string
  name: string
  party: string
  state: string
  position: string
}

interface Vote {
  id: string
  date: string
  chamber: string
  question: string | null
  result: string
  yeas: number
  nays: number
  present: number
  notVoting: number
  partyBreakdown: Record<string, { yea: number; nay: number }>
  memberPositions?: MemberPosition[]
  sourceUrl: string | null
}
import type { Party } from '@/lib/types'

const FILTERS = ['All', 'Yea', 'Nay', 'Not Voting'] as const
type Filter = (typeof FILTERS)[number]


function positionColor(position: string) {
  if (position === 'Yea') return 'text-[#1C1C1A]/70'
  if (position === 'Nay') return 'text-[#1C1C1A]/45'
  return 'text-[#1C1C1A]/25'
}

function VoteBreakdownSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      <SkeletonBox className="h-5 w-28" />
      <Card padding="none" className="p-6 sm:p-8 space-y-4">
        <div className="flex gap-3">
          <SkeletonBox className="h-4 w-20" />
          <SkeletonBox className="h-5 w-16 rounded-full" />
          <SkeletonBox className="h-5 w-24 rounded-full" />
        </div>
        <SkeletonBox className="h-7 w-2/3" />
        <SkeletonBox className="h-4 w-1/2" />
        <SkeletonBox className="h-3 rounded-full w-full" />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <Card className="h-72" />
        <Card className="h-48" />
      </div>
    </div>
  )
}

function MemberRow({ m }: { m: MemberPosition }) {
  const ps = getPartyStyle(m.party)
  return (
    <div className="flex items-center justify-between py-2 border-b border-[rgba(28,28,26,0.04)] last:border-0">
      <Link
        to="/representatives/$id"
        params={{ id: m.bioguideId }}
        className="text-sm text-[#1C1C1A]/70 hover:text-[#7B5E8A] transition-colors truncate mr-3"
      >
        {m.name}
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${ps.bg} ${ps.text}`}>{m.state}</span>
        <span className={`text-xs font-medium w-16 text-right ${positionColor(m.position)}`}>{m.position}</span>
      </div>
    </div>
  )
}

type DropdownId = 'position' | 'party' | null

function VoteContent({ vote, billId, billNumber, billTitle, fromParam }: { vote: Vote; billId: string; billNumber: string; billTitle: string; fromParam: string | null }) {
  const [filter, setFilter] = useState<Filter>('All')
  const [partyFilter, setPartyFilter] = useState<Party | 'All'>('All')
  const [openDropdown, setOpenDropdown] = useState<DropdownId>(null)
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

  const yeas = vote.yeas ?? 0
  const nays = vote.nays ?? 0
  const total = yeas + nays
  const pb = vote.partyBreakdown
  const badge = resultBadge(vote.result)

  const filtered = useMemo(() => {
    let list = vote.memberPositions ?? []
    if (filter !== 'All') list = list.filter((m: any) => m.position === filter)
    if (partyFilter !== 'All') list = list.filter((m: any) => m.party === partyFilter)
    return list
  }, [filter, partyFilter, vote.memberPositions])

  const counts = useMemo(() => {
    const c = { Yea: 0, Nay: 0, 'Not Voting': 0, Present: 0 }
    for (const m of (vote.memberPositions ?? []) as any[]) {
      if (m.position in c) c[m.position as keyof typeof c]++
    }
    return c
  }, [vote.memberPositions])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        to="/bills/$billId"
        params={{ billId }}
        search={fromParam ? { from: fromParam } : {}}
        className="inline-flex items-center gap-2 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        <span className="font-mono text-[#1C1C1A]/38">{billNumber}</span>
      </Link>

      {/* Header card: meta + title + question + bar */}
      <Card padding="none" className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs font-mono text-[#1C1C1A]/40 tracking-wide">{billNumber}</span>
              <span className="text-xs text-[#1C1C1A]/20">·</span>
              <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                vote.chamber === 'Senate' ? 'bg-[#7B5E8A]/[0.12] text-[#7B5E8A]' : 'bg-[#8A8A7A]/[0.12] text-[#8A8A7A]'
              }`}>
                {vote.chamber}
              </span>
              {vote.result && badge && (
                <>
                  <span className="text-xs text-[#1C1C1A]/20">·</span>
                  <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${badge}`}>{vote.result}</span>
                </>
              )}
            </div>

            <h1
              className="text-xl sm:text-2xl text-[#1C1C1A] leading-snug tracking-tight"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
            >
              {billTitle}
            </h1>

            {vote.question && (
              <p className="mt-2 text-sm text-[#1C1C1A]/55 leading-relaxed">
                {vote.question}
              </p>
            )}
          </div>

          {vote.sourceUrl && (
            <a
              href={vote.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#7B5E8A]/50 hover:text-[#7B5E8A] transition-colors shrink-0 mt-0.5"
            >
              Official record <ExternalLink size={11} strokeWidth={1.8} />
            </a>
          )}
        </div>

        <div className="flex items-end gap-8">
          <div>
            <div className="text-2xl font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>{yeas}</div>
            <div className="text-[10px] font-medium text-[#1C1C1A]/38 uppercase tracking-widest mt-0.5">Yea</div>
          </div>
          <div className="w-px h-7 bg-[rgba(28,28,26,0.08)]" />
          <div>
            <div className="text-2xl font-semibold text-[#1C1C1A]/70" style={{ fontFamily: 'var(--font-serif)' }}>{nays}</div>
            <div className="text-[10px] font-medium text-[#1C1C1A]/38 uppercase tracking-widest mt-0.5">Nay</div>
          </div>
          {(vote.notVoting ?? 0) > 0 && (
            <>
              <div className="w-px h-7 bg-[rgba(28,28,26,0.08)]" />
              <div>
                <div className="text-2xl font-semibold text-[#1C1C1A]/20" style={{ fontFamily: 'var(--font-serif)' }}>{vote.notVoting}</div>
                <div className="text-[10px] font-medium text-[#1C1C1A]/20 uppercase tracking-widest mt-0.5">Not Voting</div>
              </div>
            </>
          )}
          <span className="text-xs text-[#1C1C1A]/32 ml-auto self-end">{formatDate(vote.date)}</span>
        </div>

      </Card>

      {/* Two-column grid: member positions + party breakdown sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

        {/* Member positions */}
        {(vote.memberPositions?.length ?? 0) > 0 && (
          <Card>
            <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-4">
              Member Positions
              <span className="ml-1.5 normal-case tracking-normal font-normal text-[#1C1C1A]/25">
                ({filtered.length})
              </span>
            </h2>

            <div className="flex gap-2 mb-4" ref={dropdownRef}>
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'position' ? null : 'position')}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    filter !== 'All'
                      ? 'border-[#7B5E8A] bg-[#7B5E8A]/8 text-[#7B5E8A]'
                      : 'border-[rgba(28,28,26,0.15)] text-[#1C1C1A]/55 hover:border-[#7B5E8A]/50'
                  }`}
                >
                  {filter !== 'All' ? filter : 'Position'}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {openDropdown === 'position' && (
                  <Card padding="none" className="absolute top-full left-0 mt-1.5 p-1.5 min-w-[140px] z-20">
                    {FILTERS.map(f => (
                      <button
                        key={f}
                        onClick={() => { setFilter(f); setOpenDropdown(null) }}
                        className={`w-full text-left text-xs px-3 py-1.5 rounded-lg transition-colors ${
                          filter === f ? 'bg-[#7B5E8A]/8 text-[#7B5E8A]' : 'text-[#1C1C1A]/60 hover:bg-[#F5F0E8]/80'
                        }`}
                      >
                        {f}
                        {f !== 'All' && <span className="ml-1 text-[#1C1C1A]/25">({counts[f as keyof typeof counts] ?? 0})</span>}
                      </button>
                    ))}
                  </Card>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'party' ? null : 'party')}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    partyFilter !== 'All'
                      ? 'border-[#7B5E8A] bg-[#7B5E8A]/8 text-[#7B5E8A]'
                      : 'border-[rgba(28,28,26,0.15)] text-[#1C1C1A]/55 hover:border-[#7B5E8A]/50'
                  }`}
                >
                  {partyFilter !== 'All' ? PARTY_STYLES[partyFilter].label : 'Party'}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {openDropdown === 'party' && (
                  <Card padding="none" className="absolute top-full left-0 mt-1.5 p-1.5 min-w-[150px] z-20">
                    {(['All', 'Democrat', 'Republican', 'Independent'] as const).map(p => {
                      const isAll = p === 'All'
                      const s = isAll ? null : PARTY_STYLES[p]
                      return (
                        <button
                          key={p}
                          onClick={() => { setPartyFilter(p); setOpenDropdown(null) }}
                          className={`w-full text-left text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                            partyFilter === p ? 'bg-[#7B5E8A]/8 text-[#7B5E8A]' : 'text-[#1C1C1A]/60 hover:bg-[#F5F0E8]/80'
                          }`}
                        >
                          {!isAll && <span className="w-1.5 h-1.5 rounded-full" style={{ background: s!.hex }} />}
                          {isAll ? 'All parties' : s!.label}
                        </button>
                      )
                    })}
                  </Card>
                )}
              </div>
            </div>

            <div className="max-h-[36rem] overflow-y-auto">
              {filtered.length > 0 ? (
                filtered.map((m: any) => <MemberRow key={m.bioguideId} m={m} />)
              ) : (
                <p className="text-sm text-[#1C1C1A]/30 italic py-6 text-center">No members match these filters.</p>
              )}
            </div>
          </Card>
        )}

        {/* Sidebar: party breakdown */}
        {pb && (
          <div className="space-y-6">
            <Card>
              <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-4">Party Breakdown</h2>
              <div className="space-y-3">
                {(['Democrat', 'Republican', 'Independent'] as const).map(key => {
                  const d = pb[key.toLowerCase() as 'democrat' | 'republican' | 'independent']
                  if (d.yea === 0 && d.nay === 0) return null
                  const s = PARTY_STYLES[key]
                  const partyTotal = d.yea + d.nay
                  const yeaPct = partyTotal > 0 ? Math.round((d.yea / partyTotal) * 100) : 0
                  return (
                    <div key={key} className="bg-[#F5F0E8]/60 rounded-lg p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: s.hex }} />
                          <span className="text-xs font-medium text-[#1C1C1A]/55">{s.label}</span>
                        </div>
                        <span className="text-[11px] text-[#1C1C1A]/25">{partyTotal} votes</span>
                      </div>
                      <div className="flex h-1.5 rounded-full overflow-hidden bg-[#E8E3DA] mb-2">
                        <div className="h-full rounded-full" style={{ width: `${yeaPct}%`, background: s.hex }} />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium" style={{ color: s.hex }}>{d.yea} <span className="text-[10px] text-[#1C1C1A]/25 uppercase">Yea</span></span>
                        <span className="font-medium opacity-50" style={{ color: s.hex }}>{d.nay} <span className="text-[10px] text-[#1C1C1A]/25 uppercase">Nay</span></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VoteBreakdownPage({ billId, voteId }: { billId: string; voteId: string }) {
  const searchParams = useSearch({ strict: false }) as Record<string, string>
  const fromParam = searchParams['from'] ?? null
  const billBackHref = `/bills/${billId}${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ''}`
  const { data: bill, isLoading: loading, error: _billError } = useBillDetail(billId)
  const error = _billError ? String(_billError) : null

  const vote = bill?.votes.find((v: any) => v.id === decodeURIComponent(voteId)) ?? null

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-vote" />
      <div className="relative z-10 flex flex-col flex-1">
        <main className="flex-1 px-6 pt-10 pb-8">
          {loading ? (
            <VoteBreakdownSkeleton />
          ) : error || !bill ? (
            <div className="max-w-4xl mx-auto flex items-center justify-center py-24">
              <div className="text-center">
                <p className="text-[#1C1C1A]/40 mb-4">Failed to load vote details.</p>
                <Link to={billBackHref as any} className="text-sm text-[#7B5E8A] hover:text-[#6A4F78]">
                  ← Back to bill
                </Link>
              </div>
            </div>
          ) : !vote ? (
            <div className="max-w-4xl mx-auto flex items-center justify-center py-24">
              <div className="text-center">
                <p className="text-[#1C1C1A]/40 mb-4">Vote not found.</p>
                <Link to={billBackHref as any} className="text-sm text-[#7B5E8A] hover:text-[#6A4F78]">
                  ← Back to bill
                </Link>
              </div>
            </div>
          ) : (
            <VoteContent vote={vote} billId={billId} billNumber={bill.number} billTitle={bill.title} fromParam={fromParam} />
          )}
        </main>
      </div>
    </div>
  )
}
