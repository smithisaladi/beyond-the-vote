import type { Party } from '@/lib/types'

/** Coerce a free-form party string (any casing, abbreviations, null) into the canonical Party type. */
export function toParty(p?: string | null): Party {
  const s = (p ?? '').trim().toUpperCase()
  if (s === 'D' || s.includes('DEMOCRAT')) return 'Democrat'
  if (s === 'R' || s.includes('REPUBLICAN')) return 'Republican'
  return 'Independent'
}

/** Single-letter abbreviation used in compact badges (R-OH, D-CA, I-VT). */
export function partyAbbrev(party: Party): string {
  if (party === 'Democrat') return 'D'
  if (party === 'Republican') return 'R'
  return 'I'
}
