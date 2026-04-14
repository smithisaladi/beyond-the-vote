import type { Party } from '@/lib/types'

/** Coerce a free-form party string into the canonical Party type. */
export function toParty(p: string): Party {
  if (p === 'Democrat' || p === 'Republican' || p === 'Independent') return p
  return 'Independent'
}

/** Single-letter abbreviation used in compact badges (R-OH, D-CA, I-VT). */
export function partyAbbrev(party: Party): string {
  if (party === 'Democrat') return 'D'
  if (party === 'Republican') return 'R'
  return 'I'
}
