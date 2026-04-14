import { describe, it, expect } from 'vitest'
import { toParty, partyAbbrev } from './party'

describe('toParty', () => {
  it('returns canonical party for exact matches', () => {
    expect(toParty('Democrat')).toBe('Democrat')
    expect(toParty('Republican')).toBe('Republican')
    expect(toParty('Independent')).toBe('Independent')
  })

  it('falls back to Independent for non-canonical strings', () => {
    expect(toParty('Democratic')).toBe('Independent')
    expect(toParty('GOP')).toBe('Independent')
    expect(toParty('democrat')).toBe('Independent')
    expect(toParty('republican')).toBe('Independent')
    expect(toParty('')).toBe('Independent')
    expect(toParty('Libertarian')).toBe('Independent')
  })
})

describe('partyAbbrev', () => {
  it('returns the single-letter abbreviation', () => {
    expect(partyAbbrev('Democrat')).toBe('D')
    expect(partyAbbrev('Republican')).toBe('R')
    expect(partyAbbrev('Independent')).toBe('I')
  })
})
