import type { User } from '@supabase/supabase-js'
import type { Party, BillStatus } from './types'
import type { UserMetadata } from './supabase/types'

export const PARTY_STYLES: Record<Party, { bg: string; text: string; hex: string; label: string }> = {
  Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]', hex: '#7B8FA8', label: 'Democrat' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]', hex: '#A87B7B', label: 'Republican' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]', hex: '#8A8A7A', label: 'Independent' },
}

export const STATUS_STYLES: Record<BillStatus, { bg: string; text: string }> = {
  Active:    { bg: 'bg-[#7B5E8A]/[0.12]', text: 'text-[#7B5E8A]' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
  Passed:    { bg: 'bg-[#6A9B7B]/[0.12]', text: 'text-[#6A9B7B]' },
  Failed:    { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
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

export const PALETTE = {
  background: '#F5F0E8',
  text: '#1C1C1A',
  accent: '#7B5E8A',
  accentHover: '#6A4F78',
  card: 'white',
  skeleton: '#E8E3DA',
  border: 'rgba(28,28,26,0.08)',
  shadow: '0_1px_4px_rgba(0,0,0,0.06)',
  error: '#B85C38',
  success: '#6A9B7B',
  subtleBg: '#FAF8F5',
} as const
