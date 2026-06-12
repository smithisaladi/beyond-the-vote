import { describe, it, expect } from 'vitest'
import {
  PARTY_STYLES,
  STATUS_STYLES,
  getPartyStyle,
  resultBadge,
} from './ui'

describe('PARTY_STYLES', () => {
  it('has Democrat styles with all required fields', () => {
    const d = PARTY_STYLES.Democrat
    expect(d.bg).toBeTruthy()
    expect(d.text).toBeTruthy()
    expect(d.hex).toBe('#7EA5C8')
    expect(d.label).toBe('Democrat')
  })

  it('has Republican styles with all required fields', () => {
    const r = PARTY_STYLES.Republican
    expect(r.bg).toBeTruthy()
    expect(r.text).toBeTruthy()
    expect(r.hex).toBe('#C89B9B')
    expect(r.label).toBe('Republican')
  })

  it('has Independent styles with all required fields', () => {
    const i = PARTY_STYLES.Independent
    expect(i.bg).toBeTruthy()
    expect(i.text).toBeTruthy()
    expect(i.hex).toBe('#A8A896')
    expect(i.label).toBe('Independent')
  })
})

describe('STATUS_STYLES', () => {
  const statuses = ['Active', 'Committee', 'Stalled', 'Passed', 'Failed'] as const

  for (const status of statuses) {
    it(`has ${status} styles with bg and text`, () => {
      expect(STATUS_STYLES[status].bg).toBeTruthy()
      expect(STATUS_STYLES[status].text).toBeTruthy()
    })
  }
})

describe('getPartyStyle', () => {
  it('resolves "D" to Democrat styles', () => {
    expect(getPartyStyle('D')).toBe(PARTY_STYLES.Democrat)
  })

  it('resolves "R" to Republican styles', () => {
    expect(getPartyStyle('R')).toBe(PARTY_STYLES.Republican)
  })

  it('resolves "I" to Independent styles', () => {
    expect(getPartyStyle('I')).toBe(PARTY_STYLES.Independent)
  })

  it('resolves full party name', () => {
    expect(getPartyStyle('Democrat')).toBe(PARTY_STYLES.Democrat)
    expect(getPartyStyle('Republican')).toBe(PARTY_STYLES.Republican)
  })

  it('falls back to Independent for unknown codes', () => {
    expect(getPartyStyle('X')).toBe(PARTY_STYLES.Independent)
    expect(getPartyStyle('unknown')).toBe(PARTY_STYLES.Independent)
  })
})

describe('resultBadge', () => {
  it('returns green classes for passed results', () => {
    const badge = resultBadge('passed')
    expect(badge).toContain('#68B085')
  })

  it('returns green classes for "agreed" results', () => {
    const badge = resultBadge('Agreed to')
    expect(badge).toContain('#68B085')
  })

  it('returns red classes for failed results', () => {
    const badge = resultBadge('failed')
    expect(badge).toContain('#B85C38')
  })

  it('returns red classes for rejected results', () => {
    const badge = resultBadge('rejected')
    expect(badge).toContain('#B85C38')
  })

  it('returns neutral classes for other results', () => {
    const badge = resultBadge('something else')
    expect(badge).toContain('#8A8A7A')
  })

  it('returns null for null input', () => {
    expect(resultBadge(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resultBadge('')).toBeNull()
  })
})
