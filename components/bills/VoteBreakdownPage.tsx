'use client'

import { useState, useMemo, useRef, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { PARTY_STYLES } from '@/lib/ui'
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { useFetchBillDetail } from '@/hooks/useFetchBillDetail'
import type { Vote, MemberPosition } from '@/hooks/useFetchBillDetail'
import type { Party } from '@/lib/types'

const PARTY_CODE: Record<string, Party> = { D: 'Democrat', R: 'Republican', I: 'Independent' }
const FILTERS = ['All', 'Yea', 'Nay', 'Not Voting'] as const
type Filter = (typeof FILTERS)[number]

function resultBadge(result: string | null) {
  if (!result) return null
  const r = result.toLowerCase()
  if (r.includes('pass') || r.includes('agreed')) return 'bg-[#6A9B7B]/[0.12] text-[#6A9B7B]'
  if (r.includes('fail') || r.includes('rejected')) return 'bg-[#B85C38]/[0.12] text-[#B85C38]'
  return 'bg-[#8A8A7A]/[0.12] text-[#8A8A7A]'
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function positionColor(position: string) {
  if (position === 'Yea') return 'text-[#1C1C1A]/70'
  if (position === 'Nay') return 'text-[#1C1C1A]/45'
  return 'text-[#1C1C1A]/25'
}

function Skeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      <div className="h-5 w-28 bg-[#E8E3DA] rounded" />
      <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 sm:p-8 space-y-4">
        <div className="flex gap-3">
          <div className="h-5 w-16 bg-[#E8E3DA] rounded-full" />
          <div className="h-5 w-24 bg-[#E8E3DA] rounded-full" />
        </div>
        <div className="h-7 bg-[#E8E3DA] rounded w-2/3" />
        <div className="h-3 bg-[#E8E3DA] rounded-full w-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 h-72" />
        <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 h-48" />
      </div>
    </div>
  )
}

function MemberRow({ m }: { m: MemberPosition }) {
  const ps = PARTY_STYLES[PARTY_CODE[m.party] ?? 'Independent']
  return (
    <div className="flex items-center justify-between py-2 border-b border-[rgba(28,28,26,0.04)] last:border-0">
      <Link
        href={`/representatives/${m.bioguideId}`}
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

function VoteContent({ vote, billId, billNumber, billTitle }: { vote: Vote; billId: string; billNumber: string; billTitle: string }) {
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
    if (filter !== 'All') list = list.filter(m => m.position === filter)
    if (partyFilter !== 'All') list = list.filter(m => (PARTY_CODE[m.party] ?? 'Independent') === partyFilter)
    return list
  }, [filter, partyFilter, vote.memberPositions])

  const counts = useMemo(() => {
    const c = { Yea: 0, Nay: 0, 'Not Voting': 0, Present: 0 }
    for (const m of vote.memberPositions ?? []) {
      if (m.position in c) c[m.position as keyof typeof c]++
    }
    return c
  }, [vote.memberPositions])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href={`/bills/${billId}`}
        className="inline-flex items-center gap-2 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        <span className="font-mono text-[#1C1C1A]/38">{billNumber}</span>
        <span className="text-[#1C1C1A]/20">·</span>
        <span className="text-[#1C1C1A]/38 truncate max-w-xs">{billTitle}</span>
      </Link>

      {/* Header card: meta + question + bar */}
      <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-3">
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

            {vote.question && (
              <h1
                className="text-xl sm:text-2xl text-[#1C1C1A] leading-snug tracking-tight"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
              >
                {vote.question}
              </h1>
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

      </div>

      {/* Two-column grid: member positions + party breakdown sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

        {/* Member positions */}
        {(vote.memberPositions?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
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
                  <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-lg p-1.5 min-w-[140px] z-20">
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
                  </div>
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
                  <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-lg p-1.5 min-w-[150px] z-20">
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
                  </div>
                )}
              </div>
            </div>

            <div className="max-h-[36rem] overflow-y-auto">
              {filtered.length > 0 ? (
                filtered.map(m => <MemberRow key={m.bioguideId} m={m} />)
              ) : (
                <p className="text-sm text-[#1C1C1A]/30 italic py-6 text-center">No members match these filters.</p>
              )}
            </div>
          </div>
        )}

        {/* Sidebar: party breakdown */}
        {pb && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
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
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VoteBreakdownPage({ params }: { params: Promise<{ id: string; voteId: string }> }) {
  const { id, voteId } = use(params)
  const router = useRouter()
  const { bill, loading, error } = useFetchBillDetail(id)

  const vote = bill?.votes.find(v => v.id === decodeURIComponent(voteId)) ?? null

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-vote" />
      <div className="relative z-10 flex flex-col flex-1">
        <main className="flex-1 px-6 pt-10 pb-8">
          {loading ? (
            <Skeleton />
          ) : error || !bill ? (
            <div className="max-w-4xl mx-auto flex items-center justify-center py-24">
              <div className="text-center">
                <p className="text-[#1C1C1A]/40 mb-4">Failed to load vote details.</p>
                <button onClick={() => router.back()} className="text-sm text-[#7B5E8A] hover:text-[#6A4F78]">
                  ← Go back
                </button>
              </div>
            </div>
          ) : !vote ? (
            <div className="max-w-4xl mx-auto flex items-center justify-center py-24">
              <div className="text-center">
                <p className="text-[#1C1C1A]/40 mb-4">Vote not found.</p>
                <Link href={`/bills/${id}`} className="text-sm text-[#7B5E8A] hover:text-[#6A4F78]">
                  ← Back to bill
                </Link>
              </div>
            </div>
          ) : (
            <VoteContent vote={vote} billId={id} billNumber={bill.number} billTitle={bill.title} />
          )}
        </main>
      </div>
    </div>
  )
}
