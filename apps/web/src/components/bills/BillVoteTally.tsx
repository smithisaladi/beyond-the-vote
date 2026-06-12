

import { Link } from '@tanstack/react-router'
import { PARTY_STYLES, STATUS_STYLES, resultBadge } from '@/lib/ui'
import { formatShortDate } from '@/lib/format'
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


function VoteEntryContent({ vote }: { vote: Vote }) {
  const yeas = vote.yeas ?? 0
  const nays = vote.nays ?? 0
  const total = yeas + nays
  const hasData = vote.yeas !== null && vote.nays !== null
  const badge = resultBadge(vote.result)
  const pb = vote.partyBreakdown

  const segments = pb && total > 0 ? [
    { key: 'dy', count: pb.democrat.yea, color: PARTY_STYLES.Democrat.hex },
    { key: 'ry', count: pb.republican.yea, color: PARTY_STYLES.Republican.hex },
    { key: 'iy', count: pb.independent.yea, color: PARTY_STYLES.Independent.hex },
    { key: 'in', count: pb.independent.nay, color: PARTY_STYLES.Independent.hex },
    { key: 'rn', count: pb.republican.nay, color: PARTY_STYLES.Republican.hex },
    { key: 'dn', count: pb.democrat.nay, color: PARTY_STYLES.Democrat.hex },
  ] : null

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-fg/60 shrink-0">{vote.chamber}</span>
          {vote.question && (
            <>
              <span className="text-xs text-fg/20 shrink-0">·</span>
              <span className="text-xs text-fg/55 truncate">{vote.question}</span>
            </>
          )}
        </div>
        {vote.result && badge && (
          <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${badge}`}>
            {vote.result}
          </span>
        )}
      </div>

      {hasData && total > 0 ? (
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium shrink-0 font-mono tabular-nums ${STATUS_STYLES.Passed.text}`}>{yeas} Yea</span>
          <div className="flex-1 flex h-2.5 rounded-full overflow-hidden bg-fg/[0.08]">
            {segments
              ? segments.map(s => s.count > 0 && (
                  <div key={s.key} className="h-full" style={{ width: `${(s.count / total) * 100}%`, background: s.color }} />
                ))
              : <>
                  <div className="h-full" style={{ width: `${(yeas / total) * 100}%`, background: PARTY_STYLES.Democrat.hex }} />
                  <div className="h-full flex-1" style={{ background: PARTY_STYLES.Republican.hex }} />
                </>
            }
          </div>
          <span className={`text-xs font-medium shrink-0 font-mono tabular-nums ${STATUS_STYLES.Failed.text}`}>{nays} Nay</span>
        </div>
      ) : (
        <p className="text-xs text-fg/30">Vote data unavailable</p>
      )}

      <p className="text-[10.5px] text-fg/32 text-right mt-2 font-mono">
        {formatShortDate(vote.date)}
      </p>
    </>
  )
}

function VoteEntry({ vote, showBorder, billId, fromParam }: { vote: Vote; showBorder: boolean; billId: string; fromParam?: string | null }) {
  const base = showBorder ? 'pt-5 border-t border-edge-soft' : ''
  const fromQs = fromParam ? `?from=${encodeURIComponent(fromParam)}` : ''

  if (vote.id) {
    return (
      <Link
        to={`/bills/${billId}/votes/${encodeURIComponent(vote.id)}${fromQs}` as any}
        className={`block -mx-2 px-2 py-1 -my-1 rounded-lg hover:bg-accent/[0.04] transition-colors cursor-pointer ${base}`}
      >
        <VoteEntryContent vote={vote} />
      </Link>
    )
  }

  return (
    <div className={base}>
      <VoteEntryContent vote={vote} />
    </div>
  )
}

export default function BillVoteTally({ votes, billId, fromParam }: { votes: Vote[]; billId: string; fromParam?: string | null }) {
  if (!votes || votes.length === 0) return null

  return (
    <div className="space-y-5">
      {votes.map((v, i) => (
        <VoteEntry key={v.id ?? i} vote={v} showBorder={i > 0} billId={billId} fromParam={fromParam} />
      ))}
    </div>
  )
}
