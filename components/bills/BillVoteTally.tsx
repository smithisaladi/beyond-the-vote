'use client'

import Link from 'next/link'
import { PARTY_STYLES } from '@/lib/ui'
import type { Vote } from '@/hooks/useFetchBillDetail'

function formatShortDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function resultBadge(result: string | null) {
  if (!result) return null
  const r = result.toLowerCase()
  if (r.includes('pass') || r.includes('agreed')) return 'bg-[#6A9B7B]/[0.12] text-[#6A9B7B]'
  if (r.includes('fail') || r.includes('rejected')) return 'bg-[#B85C38]/[0.12] text-[#B85C38]'
  return 'bg-[#8A8A7A]/[0.12] text-[#8A8A7A]'
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
    { key: 'in', count: pb.independent.nay, color: `${PARTY_STYLES.Independent.hex}80` },
    { key: 'rn', count: pb.republican.nay, color: `${PARTY_STYLES.Republican.hex}80` },
    { key: 'dn', count: pb.democrat.nay, color: `${PARTY_STYLES.Democrat.hex}80` },
  ] : null

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#1C1C1A]/60">{vote.chamber}</span>
          <span className="text-xs text-[#1C1C1A]/30">{formatShortDate(vote.date)}</span>
        </div>
        {vote.result && badge && (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge}`}>
            {vote.result}
          </span>
        )}
      </div>

      {vote.question && (
        <p className="text-xs text-[#1C1C1A]/50 mb-2">{vote.question}</p>
      )}

      {hasData && total > 0 ? (
        <div className="space-y-1.5">
          <div className="flex h-2.5 rounded-full overflow-hidden bg-[#E8E3DA]">
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
          <div className="flex justify-between text-xs">
            <span className="text-[#1C1C1A]/70 font-medium">{yeas} Yea</span>
            <span className="text-[#1C1C1A]/45 font-medium">{nays} Nay</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#1C1C1A]/30">Vote data unavailable</p>
      )}
    </>
  )
}

function VoteEntry({ vote, showBorder, billId }: { vote: Vote; showBorder: boolean; billId: string }) {
  const base = showBorder ? 'pt-5 border-t border-[rgba(28,28,26,0.06)]' : ''

  if (vote.id) {
    return (
      <Link
        href={`/bills/${billId}/votes/${encodeURIComponent(vote.id)}`}
        className={`block -mx-2 px-2 py-1 -my-1 rounded-lg hover:bg-[#7B5E8A]/[0.04] transition-colors cursor-pointer ${base}`}
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

export default function BillVoteTally({ votes, billId }: { votes: Vote[]; billId: string }) {
  if (!votes || votes.length === 0) return null

  return (
    <div className="space-y-5">
      {votes.map((v, i) => (
        <VoteEntry key={v.id ?? i} vote={v} showBorder={i > 0} billId={billId} />
      ))}
    </div>
  )
}
