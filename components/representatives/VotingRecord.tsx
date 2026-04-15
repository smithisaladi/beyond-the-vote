'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, MinusCircle } from 'lucide-react'

interface BillVote {
  billId:    string
  date:      string
  position:  string
  result:    string
  withParty: boolean
  question?: string | null
  chamber?:  string | null
}

interface VotingRecordProps {
  votes: BillVote[]
  memberName?: string
}

export default function VotingRecord({ votes, memberName }: VotingRecordProps) {
  const [filter, setFilter] = useState<'all' | 'Yea' | 'Nay' | 'with' | 'against'>('all')

  if (!votes || votes.length === 0) {
    return <div className="text-sm text-[#1C1C1A]/45 italic">No bill votes on record.</div>
  }

  const filtered = votes.filter(v => {
    if (filter === 'all')     return true
    if (filter === 'Yea')     return v.position === 'Yea'
    if (filter === 'Nay')     return v.position === 'Nay'
    if (filter === 'with')    return v.withParty
    if (filter === 'against') return !v.withParty
    return true
  })

  const withPartyCount   = votes.filter(v => v.withParty).length
  const withPartyPercent = votes.length > 0
    ? Math.round((withPartyCount / votes.length) * 100)
    : 0

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#1C1C1A]/55">
          Voted with party <span className="text-[#1C1C1A] font-semibold">{withPartyPercent}%</span>
          {' '}of the time ({withPartyCount}/{votes.length} votes)
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'Yea', 'Nay', 'with', 'against'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filter === f
                ? 'bg-[#7B5E8A]/10 text-[#7B5E8A] border-[#7B5E8A]/20'
                : 'border-[rgba(28,28,26,0.08)] text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70'
            }`}
          >
            {f === 'all'     ? `All (${votes.length})`                    :
             f === 'Yea'     ? `Yea (${votes.filter(v => v.position === 'Yea').length})`  :
             f === 'Nay'     ? `Nay (${votes.filter(v => v.position === 'Nay').length})`  :
             f === 'with'    ? `With party (${withPartyCount})`            :
             `Against party (${votes.length - withPartyCount})`}
          </button>
        ))}
      </div>

      {/* Vote rows */}
      <div className="divide-y divide-[rgba(28,28,26,0.05)]">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-xs text-[#1C1C1A]/38 pb-2 font-medium uppercase tracking-wide">
          <span>Bill</span>
          <span>Date</span>
          <span>Vote</span>
          <span>Party</span>
        </div>
        {filtered.map((v, i) => (
          <div
            key={`${v.billId}-${i}`}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-start py-3 text-sm"
          >
            <div className="space-y-0.5 min-w-0">
              <a
                href={`/bills/${v.billId}`}
                className="text-[#1C1C1A] hover:text-[#7B5E8A] transition-colors truncate block"
              >
                {v.billId.toUpperCase().replace(/-/g, ' ').replace(/(\d+) (\w+) (\d+)/, '$1 $2. $3')}
              </a>
              {v.question && (
                <div className="text-xs text-[#1C1C1A]/38 truncate">{v.question}</div>
              )}
              <div className="text-xs text-[#1C1C1A]/38">
                {v.result}
                {v.chamber && ` · ${v.chamber}`}
              </div>
            </div>

            <span className="text-[#1C1C1A]/32 whitespace-nowrap text-xs">
              {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>

            <span className={`flex items-center gap-1 font-medium whitespace-nowrap ${
              v.position === 'Yea'       ? 'text-[#6A9B7B]' :
              v.position === 'Nay'       ? 'text-[#B85C38]' :
              'text-[#1C1C1A]/45'
            }`}>
              {v.position === 'Yea'  ? <CheckCircle size={13} strokeWidth={1.8} /> :
               v.position === 'Nay'  ? <XCircle size={13} strokeWidth={1.8} />     :
               <MinusCircle size={13} strokeWidth={1.8} />}
              {v.position}
            </span>

            <span title={v.withParty ? 'Voted with party' : 'Voted against party'}>
              {v.withParty
                ? <CheckCircle size={14} strokeWidth={1.8} className="text-[#6A9B7B]" />
                : <XCircle    size={14} strokeWidth={1.8} className="text-[#1C1C1A]/38" />}
            </span>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-sm text-[#1C1C1A]/45 italic py-4">No votes match this filter.</div>
      )}
    </div>
  )
}
