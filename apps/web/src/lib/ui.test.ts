import { describe, it, expect } from 'vitest'
import {
  PARTY_STYLES,
  STATUS_STYLES,
  IDEOLOGY_GRADIENT,
  DANGER_HOVER_CLASS,
  STAT_MONEY_CLASS,
  STAT_POSITIVE_CLASS,
  getPartyStyle,
  resultBadge,
} from './ui'

describe('PARTY_STYLES', () => {
  it('has Democrat styles with all required fields', () => {
    const d = PARTY_STYLES.Democrat
    expect(d.bg).toBeTruthy()
    expect(d.text).toBeTruthy()
    expect(d.hex).toBe('#8FBAE0')
    expect(d.label).toBe('Democrat')
  })

  it('has Republican styles with all required fields', () => {
    const r = PARTY_STYLES.Republican
    expect(r.bg).toBeTruthy()
    expect(r.text).toBeTruthy()
    expect(r.hex).toBe('#DCA8A8')
    expect(r.label).toBe('Republican')
  })

  it('has Independent styles with all required fields', () => {
    const i = PARTY_STYLES.Independent
    expect(i.bg).toBeTruthy()
    expect(i.text).toBeTruthy()
    expect(i.hex).toBe('#BBBBA6')
    expect(i.label).toBe('Independent')
  })
})

describe('STATUS_STYLES', () => {
  it('has Active styles with bg, text, and hex', () => {
    expect(STATUS_STYLES.Active.bg).toBeTruthy()
    expect(STATUS_STYLES.Active.text).toBeTruthy()
    expect(STATUS_STYLES.Active.hex).toBe('#B794D4')
  })

  it('has Committee styles with bg, text, and hex', () => {
    expect(STATUS_STYLES.Committee.bg).toBeTruthy()
    expect(STATUS_STYLES.Committee.text).toBeTruthy()
    expect(STATUS_STYLES.Committee.hex).toBe('#BBBBA6')
  })

  it('has Stalled styles with bg, text, and hex', () => {
    expect(STATUS_STYLES.Stalled.bg).toBeTruthy()
    expect(STATUS_STYLES.Stalled.text).toBeTruthy()
    expect(STATUS_STYLES.Stalled.hex).toBe('#E08B66')
  })

  it('has Passed styles with bg, text, and hex', () => {
    expect(STATUS_STYLES.Passed.bg).toBeTruthy()
    expect(STATUS_STYLES.Passed.text).toBeTruthy()
    expect(STATUS_STYLES.Passed.hex).toBe('#8FD9AC')
  })

  it('has Failed styles with bg, text, and hex', () => {
    expect(STATUS_STYLES.Failed.bg).toBeTruthy()
    expect(STATUS_STYLES.Failed.text).toBeTruthy()
    expect(STATUS_STYLES.Failed.hex).toBe('#E08B66')
  })
})

describe('IDEOLOGY_GRADIENT', () => {
  it('is a left-to-right gradient using party hex values', () => {
    expect(IDEOLOGY_GRADIENT).toBe(
      `linear-gradient(to right, ${PARTY_STYLES.Democrat.hex}, ${PARTY_STYLES.Independent.hex}, ${PARTY_STYLES.Republican.hex})`
    )
  })
})

describe('DANGER_HOVER_CLASS', () => {
  it('provides neutral at rest and danger color with background on hover', () => {
    expect(DANGER_HOVER_CLASS).toContain('text-fg/25')
    expect(DANGER_HOVER_CLASS).toContain('hover:text-[#E08B66]')
    expect(DANGER_HOVER_CLASS).toContain('hover:bg-[#B85C38]')
  })
})

describe('STAT_MONEY_CLASS', () => {
  it('provides purple-tinted cream color for money stats', () => {
    expect(STAT_MONEY_CLASS).toBe('text-[#E8D9F0]')
  })
})

describe('STAT_POSITIVE_CLASS', () => {
  it('provides green-tinted cream color for positive stats', () => {
    expect(STAT_POSITIVE_CLASS).toBe('text-[#C9ECD9]')
  })
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
    expect(badge).toContain('#8FD9AC')
  })

  it('returns green classes for "agreed" results', () => {
    const badge = resultBadge('Agreed to')
    expect(badge).toContain('#8FD9AC')
  })

  it('returns red classes for failed results', () => {
    const badge = resultBadge('failed')
    expect(badge).toContain('#E08B66')
  })

  it('returns red classes for rejected results', () => {
    const badge = resultBadge('rejected')
    expect(badge).toContain('#E08B66')
  })

  it('returns neutral classes for other results', () => {
    const badge = resultBadge('something else')
    expect(badge).toContain('#BBBBA6')
  })

  it('returns null for null input', () => {
    expect(resultBadge(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resultBadge('')).toBeNull()
  })
})
