import { describe, it, expect } from 'vitest'
import { getUserInitials, PARTY_STYLES, STATUS_STYLES } from './ui'
import type { User } from '@supabase/supabase-js'

function fakeUser(overrides: Partial<{ email: string; full_name: string }>): User {
  return {
    id: '1',
    aud: 'authenticated',
    role: 'authenticated',
    email: overrides.email ?? 'test@example.com',
    app_metadata: {},
    user_metadata: {
      ...(overrides.full_name !== undefined ? { full_name: overrides.full_name } : {}),
    },
    created_at: '',
  } as User
}

describe('getUserInitials', () => {
  it('returns first + last initials for two-word name', () => {
    expect(getUserInitials(fakeUser({ full_name: 'John Smith' }))).toBe('JS')
  })

  it('returns first + last for 3+ word name', () => {
    expect(getUserInitials(fakeUser({ full_name: 'Jean Claude Van Damme' }))).toBe('JD')
  })

  it('returns first char for single-word name', () => {
    expect(getUserInitials(fakeUser({ full_name: 'Madonna' }))).toBe('M')
  })

  it('trims whitespace in name', () => {
    expect(getUserInitials(fakeUser({ full_name: '  John  Smith  ' }))).toBe('JS')
  })

  it('falls back to email first char when no full_name', () => {
    expect(getUserInitials(fakeUser({ email: 'zara@example.com' }))).toBe('Z')
  })

  it('falls back to "?" when no full_name and no email', () => {
    const user = fakeUser({})
    user.email = undefined as unknown as string
    expect(getUserInitials(user)).toBe('?')
  })

  it('uppercases result', () => {
    expect(getUserInitials(fakeUser({ full_name: 'john smith' }))).toBe('JS')
  })
})

describe('PARTY_STYLES', () => {
  it('has entries for all three parties', () => {
    expect(PARTY_STYLES).toHaveProperty('Democrat')
    expect(PARTY_STYLES).toHaveProperty('Republican')
    expect(PARTY_STYLES).toHaveProperty('Independent')
  })

  it('each entry has bg, text, and label', () => {
    for (const party of ['Democrat', 'Republican', 'Independent'] as const) {
      expect(PARTY_STYLES[party].bg).toBeTruthy()
      expect(PARTY_STYLES[party].text).toBeTruthy()
      expect(PARTY_STYLES[party].label).toBeTruthy()
    }
  })
})

describe('STATUS_STYLES', () => {
  it('has entries for all five statuses', () => {
    for (const status of ['Active', 'Committee', 'Stalled', 'Passed', 'Failed'] as const) {
      expect(STATUS_STYLES[status].bg).toBeTruthy()
      expect(STATUS_STYLES[status].text).toBeTruthy()
    }
  })
})
