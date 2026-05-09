import type { User } from '@supabase/supabase-js'
import type { Party, BillStatus } from './types'
import type { UserMetadata } from './supabase/types'

export const PARTY_STYLES: Record<Party, { bg: string; text: string; hex: string; label: string }> = {
  Democrat:    { bg: 'bg-[#5E85A8]/[0.12]', text: 'text-[#5E85A8]', hex: '#5E85A8', label: 'Democrat' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]', hex: '#A87B7B', label: 'Republican' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]', hex: '#8A8A7A', label: 'Independent' },
}

export const STATUS_STYLES: Record<BillStatus, { bg: string; text: string }> = {
  Active:    { bg: 'bg-[#7B5E8A]/[0.12]', text: 'text-[#7B5E8A]' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
  Passed:    { bg: 'bg-[#68B085]/[0.12]', text: 'text-[#68B085]' },
  Failed:    { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
}

/** Standard card shell — white bg, subtle border, soft shadow, rounded-xl. No padding; compose with your own. */
export const CARD_CLASS =
  'bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)]'

/** Lighter border used on settings/form cards. No shadow. */
export const CARD_LIGHT_BORDER_CLASS =
  'bg-white rounded-xl border border-[#D6CFC4]'

/** Hover elevation applied to clickable tile cards. Must be placed inside a `group` wrapper. */
export const CARD_HOVER_CLASS =
  'group-hover:shadow-md group-hover:border-[#7B5E8A]/20 transition-all'

/** Skeleton placeholder fill. Pair with `animate-pulse` on an ancestor. */
export const SKELETON_BG = 'bg-[#E8E3DA]'

/** Returns Tailwind badge classes for a vote result string (passed/failed/neutral). */
export function resultBadge(result: string | null): string | null {
  if (!result) return null
  const r = result.toLowerCase()
  if (r.includes('pass') || r.includes('agreed')) return 'bg-[#68B085]/[0.12] text-[#68B085]'
  if (r.includes('fail') || r.includes('rejected')) return 'bg-[#B85C38]/[0.12] text-[#B85C38]'
  return 'bg-[#8A8A7A]/[0.12] text-[#8A8A7A]'
}

const PARTY_CODE_MAP: Record<string, Party> = { D: 'Democrat', R: 'Republican', I: 'Independent' }

/** Resolve a party code ('D', 'R', 'I') or full name to the corresponding PARTY_STYLES entry. */
export function getPartyStyle(partyCode: string) {
  return PARTY_STYLES[PARTY_CODE_MAP[partyCode] ?? (partyCode as Party)] ?? PARTY_STYLES.Independent
}

export function getUserInitials(user: User): string {
  const meta = user.user_metadata as UserMetadata | undefined
  const name = meta?.full_name
  if (name) {
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0][0].toUpperCase()
  }
  return (user.email?.[0] ?? '?').toUpperCase()
}
