

import { toParty } from '@/lib/party'
import { PARTY_STYLES } from '@/lib/ui'

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
  const segments: Array<{ key: string; pct: number; hex: string }> = []
  if (r > 0) segments.push({ key: 'R', pct: (r / total) * 100, hex: PARTY_STYLES.Republican.hex })
  if (d > 0) segments.push({ key: 'D', pct: (d / total) * 100, hex: PARTY_STYLES.Democrat.hex })
  if (i > 0) segments.push({ key: 'I', pct: (i / total) * 100, hex: PARTY_STYLES.Independent.hex })

  const parts: string[] = []
  if (r > 0) parts.push(`${r}R`)
  if (d > 0) parts.push(`${d}D`)
  if (i > 0) parts.push(`${i}I`)

  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-1 rounded-full overflow-hidden bg-fg/[0.06] ${barClassName}`}>
        {segments.map(s => (
          <div key={s.key} style={{ width: `${s.pct}%`, backgroundColor: `${s.hex}b3` }} />
        ))}
      </div>
      <span className="text-xs text-fg/45 tabular-nums">{parts.join(' · ')}</span>
    </div>
  )
}
