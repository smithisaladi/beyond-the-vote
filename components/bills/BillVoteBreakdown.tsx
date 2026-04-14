'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { PARTY_STYLES } from '@/lib/ui'

interface PartyBreakdown {
  democrat:    { yea: number; nay: number }
  republican:  { yea: number; nay: number }
  independent: { yea: number; nay: number }
}

interface MemberPosition {
  bioguideId: string
  name:       string
  party:      string
  state:      string
  photoUrl:   string | null
  position:   string
}

interface VoteSummary {
  id:             string | null
  date:           string
  chamber:        string
  question:       string | null
  result:         string | null
  yeas:           number
  nays:           number
  partyBreakdown: PartyBreakdown | null
  memberPositions: MemberPosition[]
}

interface BillVoteBreakdownProps {
  votes: VoteSummary[]
}

function VoteBar({ yeas, nays, partyBreakdown }: { yeas: number; nays: number; partyBreakdown: PartyBreakdown | null }) {
  const total = yeas + nays
  if (total === 0) return null
  const yeaPct = Math.round((yeas / total) * 100)

  if (!partyBreakdown) {
    return (
      <div className="w-full h-4 rounded-full overflow-hidden flex">
        <div className="bg-[#6A9B7B] h-full transition-all" style={{ width: `${yeaPct}%` }} />
        <div className="bg-[#B85C38] h-full transition-all flex-1" />
      </div>
    )
  }

  const { democrat: d, republican: r, independent: i } = partyBreakdown
  const segments = [
    { label: 'Dem Yea',  count: d.yea, color: '#7B8FA8' },
    { label: 'Rep Yea',  count: r.yea, color: '#A87B7B' },
    { label: 'Ind Yea',  count: i.yea, color: '#8A8A7A' },
    { label: 'Ind Nay',  count: i.nay, color: '#8A8A7A80' },
    { label: 'Rep Nay',  count: r.nay, color: '#A87B7B80' },
    { label: 'Dem Nay',  count: d.nay, color: '#7B8FA880' },
  ]

  return (
    <div className="w-full h-4 rounded-full overflow-hidden flex" title={`${yeas} Yea – ${nays} Nay`}>
      {segments.map(s => s.count > 0 && (
        <div
          key={s.label}
          className="h-full transition-all"
          style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
          title={`${s.label}: ${s.count}`}
        />
      ))}
    </div>
  )
}

function VoteCard({ vote }: { vote: VoteSummary }) {
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState<'all' | 'Yea' | 'Nay' | 'Not Voting'>('all')

  const passed = vote.result?.toLowerCase().includes('pass') || vote.result?.toLowerCase().includes('agreed')
  const total  = vote.yeas + vote.nays

  const filteredPositions = vote.memberPositions.filter(
    m => filter === 'all' || m.position === filter
  )

  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-[#1C1C1A]/38">{vote.date} · {vote.chamber}</div>
          {vote.question && (
            <div className="text-sm font-medium text-[#1C1C1A] mt-0.5">{vote.question}</div>
          )}
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
          passed ? 'bg-[#6A9B7B]/[0.12] text-[#6A9B7B]' : 'bg-[#B85C38]/[0.12] text-[#B85C38]'
        }`}>
          {vote.result ?? (passed ? 'Passed' : 'Failed')}
        </span>
      </div>

      <VoteBar yeas={vote.yeas} nays={vote.nays} partyBreakdown={vote.partyBreakdown} />

      <div className="flex justify-between text-sm">
        <span className="text-[#6A9B7B] font-medium">{vote.yeas} Yea</span>
        {total > 0 && <span className="text-[#1C1C1A]/38 text-xs">{total} total</span>}
        <span className="text-[#B85C38] font-medium">{vote.nays} Nay</span>
      </div>

      {vote.memberPositions.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-[#1C1C1A]/45 hover:text-[#1C1C1A] transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Hide' : 'Show'} member positions ({vote.memberPositions.length})
          </button>

          {expanded && (
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                {(['all', 'Yea', 'Nay', 'Not Voting'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      filter === f
                        ? 'bg-[#9B7FA6]/10 text-[#9B7FA6] border-[#9B7FA6]/20'
                        : 'border-[rgba(28,28,26,0.08)] text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70'
                    }`}
                  >
                    {f === 'all' ? 'All' : f}
                    {f !== 'all' && (
                      <span className="ml-1 text-[#1C1C1A]/38">
                        ({vote.memberPositions.filter(m => m.position === f).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {filteredPositions.map(m => {
                  const partyKey = m.party === 'D' ? 'Democrat' : m.party === 'R' ? 'Republican' : 'Independent'
                  const ps = PARTY_STYLES[partyKey as keyof typeof PARTY_STYLES]
                  return (
                    <div
                      key={m.bioguideId}
                      className="flex items-center justify-between text-xs py-1 border-b border-[rgba(28,28,26,0.05)] last:border-0"
                    >
                      <span className="text-[#1C1C1A]/70">{m.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${ps?.bg ?? ''} ${ps?.text ?? 'text-[#1C1C1A]/45'}`}>
                          {m.state}
                        </span>
                        <span className={
                          m.position === 'Yea'        ? 'text-[#6A9B7B] font-medium' :
                          m.position === 'Nay'        ? 'text-[#B85C38] font-medium' :
                          'text-[#1C1C1A]/38'
                        }>{m.position}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function BillVoteBreakdown({ votes }: BillVoteBreakdownProps) {
  if (!votes || votes.length === 0) {
    return <div className="text-sm text-[#1C1C1A]/45 italic">No recorded votes found for this bill.</div>
  }

  return (
    <div className="space-y-4">
      {votes.map((v, i) => (
        <VoteCard key={v.id ?? i} vote={v} />
      ))}
    </div>
  )
}
