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
    return <div className="text-sm text-gray-400 italic">No bill votes on record.</div>
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
        <span className="text-gray-400">
          Voted with party <span className="text-white font-semibold">{withPartyPercent}%</span>
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
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300'
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
      <div className="divide-y divide-white/5">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-xs text-gray-500 pb-2 font-medium uppercase tracking-wide">
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
                className="text-white hover:text-blue-400 transition-colors truncate block"
              >
                {v.billId.toUpperCase().replace(/-/g, ' ').replace(/(\d+) (\w+) (\d+)/, '$1 $2. $3')}
              </a>
              {v.question && (
                <div className="text-xs text-gray-500 truncate">{v.question}</div>
              )}
              <div className="text-xs text-gray-500">
                {v.result}
                {v.chamber && ` · ${v.chamber}`}
              </div>
            </div>

            <span className="text-gray-400 whitespace-nowrap text-xs">
              {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>

            <span className={`flex items-center gap-1 font-medium whitespace-nowrap ${
              v.position === 'Yea'       ? 'text-emerald-400' :
              v.position === 'Nay'       ? 'text-red-400' :
              'text-gray-400'
            }`}>
              {v.position === 'Yea'  ? <CheckCircle size={13} /> :
               v.position === 'Nay'  ? <XCircle size={13} />     :
               <MinusCircle size={13} />}
              {v.position}
            </span>

            <span title={v.withParty ? 'Voted with party' : 'Voted against party'}>
              {v.withParty
                ? <CheckCircle size={14} className="text-emerald-400" />
                : <XCircle    size={14} className="text-gray-500" />}
            </span>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-sm text-gray-400 italic py-4">No votes match this filter.</div>
      )}
    </div>
  )
}
