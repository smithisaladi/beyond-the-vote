import { PARTY_STYLES } from '@/lib/ui'
import type { Party } from '@/lib/types'

const PARTY_ABBREV: Record<string, Party> = {
  D: 'Democrat',
  R: 'Republican',
  I: 'Independent',
}

interface PartyBadgeProps {
  party: string
}

export function PartyBadge({ party }: PartyBadgeProps) {
  const partyKey: Party = PARTY_ABBREV[party] ?? (party as Party) ?? 'Independent'
  const style = PARTY_STYLES[partyKey] ?? PARTY_STYLES.Independent

  return (
    <span className={`text-[10px] font-medium px-1.5 py-px rounded-full ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}
