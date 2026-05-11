import { PARTY_STYLES } from '@/lib/ui'
import type { Party } from '@/lib/types'

const PARTY_ABBREV: Record<string, Party> = {
  D: 'Democrat',
  R: 'Republican',
  I: 'Independent',
}

interface PartyBadgeProps {
  party: string
  size?: 'xs' | 'sm'
}

export function PartyBadge({ party, size = 'sm' }: PartyBadgeProps) {
  const partyKey: Party = PARTY_ABBREV[party] ?? (party as Party) ?? 'Independent'
  const style = PARTY_STYLES[partyKey] ?? PARTY_STYLES.Independent

  const sizeClasses = size === 'xs'
    ? 'text-[10px] px-2 py-0.5'
    : 'text-xs px-2.5 py-0.5'

  return (
    <span className={`font-medium rounded-full ${sizeClasses} ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}
