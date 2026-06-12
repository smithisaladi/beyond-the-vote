

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { PARTY_STYLES, STATUS_STYLES, getPartyStyle, resultBadge } from '@/lib/ui'
import { Card } from '@/components/ui/Card'

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
      <div className="w-full h-4 rounded-full overflow-hidden flex bg-fg/[0.08]">
        <div className="h-full transition-all" style={{ width: `${yeaPct}%`, background: STATUS_STYLES.Passed.hex }} />
        <div className="h-full transition-all flex-1" style={{ background: STATUS_STYLES.Failed.hex }} />
      </div>
    )
  }

  const { democrat: d, republican: r, independent: i } = partyBreakdown
  const segments = [
    { label: 'Dem Yea',  count: d.yea, color: PARTY_STYLES.Democrat.hex },
    { label: 'Rep Yea',  count: r.yea, color: PARTY_STYLES.Republican.hex },
    { label: 'Ind Yea',  count: i.yea, color: PARTY_STYLES.Independent.hex },
    { label: 'Ind Nay',  count: i.nay, color: PARTY_STYLES.Independent.hex },
    { label: 'Rep Nay',  count: r.nay, color: PARTY_STYLES.Republican.hex },
    { label: 'Dem Nay',  count: d.nay, color: PARTY_STYLES.Democrat.hex },
  ]

  return (
    <div className="w-full h-4 rounded-full overflow-hidden flex bg-fg/[0.08]" title={`${yeas} Yea – ${nays} Nay`}>
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

  const badge = resultBadge(vote.result ?? null)
  const total  = vote.yeas + vote.nays

  const filteredPositions = vote.memberPositions.filter(
    m => filter === 'all' || m.position === filter
  )

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-fg/38">{vote.date} · {vote.chamber}</div>
          {vote.question && (
            <div className="text-[13px] font-medium text-fg mt-0.5">{vote.question}</div>
          )}
        </div>
        {badge && (
          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-px rounded-full ${badge}`}>
            {vote.result}
          </span>
        )}
      </div>

      <VoteBar yeas={vote.yeas} nays={vote.nays} partyBreakdown={vote.partyBreakdown} />

      <div className="flex justify-between text-[13px]">
        <span className={`font-medium font-mono tabular-nums ${STATUS_STYLES.Passed.text}`}>{vote.yeas} Yea</span>
        {total > 0 && <span className="text-fg/38 text-xs font-mono tabular-nums">{total} total</span>}
        <span className={`font-medium font-mono tabular-nums ${STATUS_STYLES.Failed.text}`}>{vote.nays} Nay</span>
      </div>

      {vote.memberPositions.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-fg/45 hover:text-fg transition-colors"
          >
            {expanded ? <ChevronUp size={14} strokeWidth={1.8} /> : <ChevronDown size={14} strokeWidth={1.8} />}
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
                        ? 'bg-accent/[0.12] text-accent border-accent/20'
                        : 'border-edge text-fg/45 hover:text-fg/70'
                    }`}
                  >
                    {f === 'all' ? 'All' : f}
                    {f !== 'all' && (
                      <span className="ml-1 text-fg/38">
                        ({vote.memberPositions.filter(m => m.position === f).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {filteredPositions.map(m => {
                  const ps = getPartyStyle(m.party)
                  return (
                    <div
                      key={m.bioguideId}
                      className="flex items-center justify-between text-xs py-1 border-b border-edge-soft last:border-0"
                    >
                      <span className="text-fg/70">{m.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${ps.bg} ${ps.text}`}>
                          {m.state}
                        </span>
                        <span className={
                          m.position === 'Yea' ? `${STATUS_STYLES.Passed.text} font-medium` :
                          m.position === 'Nay' ? `${STATUS_STYLES.Failed.text} font-medium` :
                          'text-fg/38'
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
    </Card>
  )
}

export default function BillVoteBreakdown({ votes }: BillVoteBreakdownProps) {
  if (!votes || votes.length === 0) {
    return <div className="text-[13px] text-fg/45 italic">No recorded votes found for this bill.</div>
  }

  return (
    <div className="space-y-3">
      {votes.map((v, i) => (
        <VoteCard key={v.id ?? i} vote={v} />
      ))}
    </div>
  )
}
