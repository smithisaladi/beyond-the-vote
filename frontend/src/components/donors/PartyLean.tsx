
import { toParty } from '@/lib/party'

interface Recipient {
  party: string
}

interface Props {
  recipients: Recipient[]
  /** Bar width. Defaults to 24 (`w-24`, ~96px) to match the list-page cards. */
  barClassName?: string
}

/**
 * Stacked party-lean bar. Counts R / D / I affiliations across the given
 * recipients and renders a proportional horizontal bar plus a compact text
 * summary ("17R", "12D · 5R", "8R · 3D · 1I").
 *
 * Works for any array whose items have a `party` string field — used with
 * both `ContributorRecipient` (5-row preview on /donors cards) and
 * `PacDetailRecipient` (full list on /donors/[id]).
 */
export function PartyLean({ recipients, barClassName = 'w-24' }: Props) {
  if (recipients.length === 0) return null

  let d = 0, r = 0, i = 0
  for (const rec of recipients) {
    const p = toParty(rec.party)
    if (p === 'Democrat') d++
    else if (p === 'Republican') r++
    else i++
  }
  const total = d + r + i
  const segments: Array<{ key: string; pct: number; className: string }> = []
  if (r > 0) segments.push({ key: 'R', pct: (r / total) * 100, className: 'bg-[#A87B7B]/70' })
  if (d > 0) segments.push({ key: 'D', pct: (d / total) * 100, className: 'bg-[#5E85A8]/70' })
  if (i > 0) segments.push({ key: 'I', pct: (i / total) * 100, className: 'bg-[#8A8A7A]/70' })

  const parts: string[] = []
  if (r > 0) parts.push(`${r}R`)
  if (d > 0) parts.push(`${d}D`)
  if (i > 0) parts.push(`${i}I`)

  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-1 rounded-full overflow-hidden bg-[#E8E3DA] ${barClassName}`}>
        {segments.map(s => (
          <div key={s.key} className={s.className} style={{ width: `${s.pct}%` }} />
        ))}
      </div>
      <span className="text-[11px] text-[#1C1C1A]/45 tabular-nums">{parts.join(' · ')}</span>
    </div>
  )
}
