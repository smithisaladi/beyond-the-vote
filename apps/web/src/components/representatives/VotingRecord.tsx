

import { useState } from 'react'
import { CheckCircle, XCircle, MinusCircle } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { parseLocalDate } from '@/lib/format'
import { STATUS_STYLES } from '@/lib/ui'

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
    return <div className="text-sm text-fg/45 italic">No bill votes on record.</div>
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
        <span className="text-fg/55">
          Voted with party <span className="text-fg font-semibold font-mono">{withPartyPercent}%</span>
          {' '}of the time (<span className="font-mono">{withPartyCount}/{votes.length}</span> votes)
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
                ? 'bg-accent-deep/10 text-accent border-accent/20'
                : 'border-edge text-fg/45 hover:text-fg/70'
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
      <div className="divide-y divide-edge-soft">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-xs text-fg/38 pb-2 font-medium uppercase tracking-wide">
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
              <Link
                to="/bills/$billId"
                params={{ billId: v.billId }}
                className="text-fg hover:text-accent transition-colors truncate block"
              >
                {v.billId.toUpperCase().replace(/-/g, ' ').replace(/(\d+) (\w+) (\d+)/, '$1 $2. $3')}
              </Link>
              {v.question && (
                <div className="text-xs text-fg/38 truncate">{v.question}</div>
              )}
              <div className="text-xs text-fg/38">
                {v.result}
                {v.chamber && ` · ${v.chamber}`}
              </div>
            </div>

            <span className="text-fg/32 whitespace-nowrap text-xs">
              {parseLocalDate(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>

            <span className={`flex items-center gap-1 font-medium whitespace-nowrap ${
              v.position === 'Yea'       ? STATUS_STYLES.Passed.text :
              v.position === 'Nay'       ? STATUS_STYLES.Failed.text :
              'text-fg/45'
            }`}>
              {v.position === 'Yea'  ? <CheckCircle size={13} strokeWidth={1.8} /> :
               v.position === 'Nay'  ? <XCircle size={13} strokeWidth={1.8} />     :
               <MinusCircle size={13} strokeWidth={1.8} />}
              {v.position}
            </span>

            <span title={v.withParty ? 'Voted with party' : 'Voted against party'}>
              {v.withParty
                ? <CheckCircle size={14} strokeWidth={1.8} className={STATUS_STYLES.Passed.text} />
                : <XCircle    size={14} strokeWidth={1.8} className="text-fg/38" />}
            </span>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-sm text-fg/45 italic py-4">No votes match this filter.</div>
      )}
    </div>
  )
}
