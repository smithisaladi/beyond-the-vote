import type { Party, BillStatus } from './types'

export const PARTY_STYLES: Record<Party, { bg: string; text: string; hex: string; label: string }> = {
  Democrat:    { bg: 'bg-[#5E85A8]/[0.14] border border-[#5E85A8]/25', text: 'text-[#7EA5C8]', hex: '#7EA5C8', label: 'Democrat' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.14] border border-[#A87B7B]/25', text: 'text-[#C89B9B]', hex: '#C89B9B', label: 'Republican' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.14] border border-[#8A8A7A]/25', text: 'text-[#A8A896]', hex: '#A8A896', label: 'Independent' },
}

export const STATUS_STYLES: Record<BillStatus, { bg: string; text: string; hex: string }> = {
  Active:    { bg: 'bg-[#7B5E8A]/[0.14] border border-[#7B5E8A]/25', text: 'text-[#9B7EAA]', hex: '#9B7EAA' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.14] border border-[#8A8A7A]/25', text: 'text-[#A8A896]', hex: '#A8A896' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.14] border border-[#B85C38]/25', text: 'text-[#C97A5A]', hex: '#C97A5A' },
  Passed:    { bg: 'bg-[#68B085]/[0.14] border border-[#68B085]/25', text: 'text-[#7FC29B]', hex: '#7FC29B' },
  Failed:    { bg: 'bg-[#B85C38]/[0.14] border border-[#B85C38]/25', text: 'text-[#C97A5A]', hex: '#C97A5A' },
}

/** Left-to-right ideology spectrum gradient (liberal → independent → conservative). */
export const IDEOLOGY_GRADIENT = `linear-gradient(to right, ${PARTY_STYLES.Democrat.hex}, ${PARTY_STYLES.Independent.hex}, ${PARTY_STYLES.Republican.hex})`

/** Standard card shell — dark surface, hairline border, no shadow. No padding; compose with your own. */
export const CARD_CLASS = 'bg-surface rounded-xl border border-edge'

/** Form/settings card — same surface, slightly stronger border. */
export const CARD_LIGHT_BORDER_CLASS = 'bg-surface rounded-xl border border-fg/12'

/** Hover treatment for clickable tile cards. Must be placed inside a `group` wrapper. */
export const CARD_HOVER_CLASS = 'group-hover:bg-raised group-hover:border-fg/15 transition-colors'

/** Skeleton placeholder fill. Pair with `animate-pulse` on an ancestor. */
export const SKELETON_BG = 'bg-fg/[0.06]'

/** Destructive icon-button hover treatment — neutral at rest, danger on hover. */
export const DANGER_HOVER_CLASS = 'text-fg/25 hover:text-[#C97A5A] hover:bg-[#B85C38]/[0.08]'

/** Destructive solid button. */
export const DANGER_BUTTON_CLASS = 'bg-[#B85C38]/[0.14] text-[#C97A5A] border border-[#B85C38]/25 hover:bg-[#B85C38]/[0.22] transition-colors'

/** Returns Tailwind badge classes for a vote result string (passed/failed/neutral). */
export function resultBadge(result: string | null): string | null {
  if (!result) return null
  const r = result.toLowerCase()
  if (r.includes('pass') || r.includes('agreed')) return 'bg-[#68B085]/[0.14] text-[#7FC29B]'
  if (r.includes('fail') || r.includes('rejected')) return 'bg-[#B85C38]/[0.14] text-[#C97A5A]'
  return 'bg-[#8A8A7A]/[0.14] text-[#A8A896]'
}

const PARTY_CODE_MAP: Record<string, Party> = { D: 'Democrat', R: 'Republican', I: 'Independent' }

/** Resolve a party code ('D', 'R', 'I') or full name to the corresponding PARTY_STYLES entry. */
export function getPartyStyle(partyCode: string) {
  return PARTY_STYLES[PARTY_CODE_MAP[partyCode] ?? (partyCode as Party)] ?? PARTY_STYLES.Independent
}
