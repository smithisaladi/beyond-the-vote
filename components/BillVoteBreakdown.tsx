'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

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
        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${yeaPct}%` }} />
        <div className="bg-red-500 h-full transition-all flex-1" />
      </div>
    )
  }

  const { democrat: d, republican: r, independent: i } = partyBreakdown
  const segments = [
    { label: 'Dem Yea',  count: d.yea, color: '#3b82f6' },
    { label: 'Rep Yea',  count: r.yea, color: '#7dd3fc' },
    { label: 'Ind Yea',  count: i.yea, color: '#a78bfa' },
    { label: 'Ind Nay',  count: i.nay, color: '#c4b5fd' },
    { label: 'Rep Nay',  count: r.nay, color: '#fca5a5' },
    { label: 'Dem Nay',  count: d.nay, color: '#ef4444' },
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
    <div className="border border-white/10 rounded-xl p-4 space-y-3 bg-white/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-gray-400">{vote.date} · {vote.chamber}</div>
          {vote.question && (
            <div className="text-sm font-medium text-white mt-0.5">{vote.question}</div>
          )}
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
          passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {vote.result ?? (passed ? 'Passed' : 'Failed')}
        </span>
      </div>

      <VoteBar yeas={vote.yeas} nays={vote.nays} partyBreakdown={vote.partyBreakdown} />

      <div className="flex justify-between text-sm">
        <span className="text-emerald-400 font-medium">{vote.yeas} Yea</span>
        {total > 0 && <span className="text-gray-500 text-xs">{total} total</span>}
        <span className="text-red-400 font-medium">{vote.nays} Nay</span>
      </div>

      {vote.memberPositions.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
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
                        ? 'border-white/40 bg-white/10 text-white'
                        : 'border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    {f === 'all' ? 'All' : f}
                    {f !== 'all' && (
                      <span className="ml-1 text-gray-500">
                        ({vote.memberPositions.filter(m => m.position === f).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {filteredPositions.map(m => (
                  <div
                    key={m.bioguideId}
                    className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0"
                  >
                    <span className="text-gray-300">{m.name}</span>
                    <div className="flex items-center gap-2 text-gray-400 shrink-0">
                      <span>{m.state}</span>
                      <span className={
                        m.position === 'Yea'        ? 'text-emerald-400 font-medium' :
                        m.position === 'Nay'        ? 'text-red-400 font-medium' :
                        'text-gray-500'
                      }>{m.position}</span>
                    </div>
                  </div>
                ))}
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
    return <div className="text-sm text-gray-400 italic">No recorded votes found for this bill.</div>
  }

  return (
    <div className="space-y-4">
      {votes.map((v, i) => (
        <VoteCard key={v.id ?? i} vote={v} />
      ))}
    </div>
  )
}
