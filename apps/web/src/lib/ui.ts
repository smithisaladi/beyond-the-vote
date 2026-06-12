import type { Party, BillStatus } from './types'

export const PARTY_STYLES: Record<Party, { bg: string; text: string; hex: string; label: string }> = {
  Democrat:    { bg: 'bg-[#5E85A8]/[0.22] border border-[#8FBAE0]/40', text: 'text-[#8FBAE0]', hex: '#8FBAE0', label: 'Democrat' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.22] border border-[#DCA8A8]/40', text: 'text-[#DCA8A8]', hex: '#DCA8A8', label: 'Republican' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.22] border border-[#BBBBA6]/40', text: 'text-[#BBBBA6]', hex: '#BBBBA6', label: 'Independent' },
}

export const STATUS_STYLES: Record<BillStatus, { bg: string; text: string; hex: string }> = {
  Active:    { bg: 'bg-[#7B5E8A]/[0.22] border border-[#B794D4]/40', text: 'text-[#B794D4]', hex: '#B794D4' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.22] border border-[#BBBBA6]/40', text: 'text-[#BBBBA6]', hex: '#BBBBA6' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.22] border border-[#E08B66]/40', text: 'text-[#E08B66]', hex: '#E08B66' },
  Passed:    { bg: 'bg-[#68B085]/[0.22] border border-[#8FD9AC]/40', text: 'text-[#8FD9AC]', hex: '#8FD9AC' },
  Failed:    { bg: 'bg-[#B85C38]/[0.22] border border-[#E08B66]/40', text: 'text-[#E08B66]', hex: '#E08B66' },
}

/** Left-to-right ideology spectrum gradient (liberal → independent → conservative). */
export const IDEOLOGY_GRADIENT = `linear-gradient(to right, ${PARTY_STYLES.Democrat.hex}, ${PARTY_STYLES.Independent.hex}, ${PARTY_STYLES.Republican.hex})`

/** Standard card shell — dark surface, hairline border, no shadow. No padding; compose with your own. */
export const CARD_CLASS = 'bg-surface rounded-lg border border-edge'

/** Form/settings card — same surface, slightly stronger border. */
export const CARD_LIGHT_BORDER_CLASS = 'bg-surface rounded-lg border border-fg/12'

/** Hover treatment for clickable tile cards. Must be placed inside a `group` wrapper. */
export const CARD_HOVER_CLASS = 'group-hover:bg-raised group-hover:border-fg/15 transition-colors'

/** Skeleton placeholder fill. Pair with `animate-pulse` on an ancestor. */
export const SKELETON_BG = 'bg-fg/[0.06]'

/** Destructive icon-button hover treatment — neutral at rest, danger on hover. */
export const DANGER_HOVER_CLASS = 'text-fg/25 hover:text-[#E08B66] hover:bg-[#B85C38]/[0.12]'

/** Destructive solid button. */
export const DANGER_BUTTON_CLASS = 'bg-[#B85C38]/[0.22] text-[#E08B66] border border-[#E08B66]/40 hover:bg-[#B85C38]/[0.3] transition-colors'

/** Money stat numbers — purple-tinted cream. */
export const STAT_MONEY_CLASS = 'text-[#E8D9F0]'

/** Positive-metric stat numbers (scores, unity, passed counts) — green-tinted cream. */
export const STAT_POSITIVE_CLASS = 'text-[#C9ECD9]'

/** Returns Tailwind badge classes for a vote result string (passed/failed/neutral). */
export function resultBadge(result: string | null): string | null {
  if (!result) return null
  const r = result.toLowerCase()
  if (r.includes('pass') || r.includes('agreed')) return 'bg-[#68B085]/[0.22] text-[#8FD9AC]'
  if (r.includes('fail') || r.includes('rejected')) return 'bg-[#B85C38]/[0.22] text-[#E08B66]'
  return 'bg-[#8A8A7A]/[0.22] text-[#BBBBA6]'
}

const PARTY_CODE_MAP: Record<string, Party> = { D: 'Democrat', R: 'Republican', I: 'Independent' }

/** Resolve a party code ('D', 'R', 'I') or full name to the corresponding PARTY_STYLES entry. */
export function getPartyStyle(partyCode: string) {
  return PARTY_STYLES[PARTY_CODE_MAP[partyCode] ?? (partyCode as Party)] ?? PARTY_STYLES.Independent
}
