import { describe, it, expect } from 'vitest'
import { toParty, partyAbbrev } from './party'

describe('toParty', () => {
  it('returns canonical party for exact matches', () => {
    expect(toParty('Democrat')).toBe('Democrat')
    expect(toParty('Republican')).toBe('Republican')
    expect(toParty('Independent')).toBe('Independent')
  })

  it('handles case-insensitive and variant spellings', () => {
    expect(toParty('democrat')).toBe('Democrat')
    expect(toParty('Democratic')).toBe('Democrat')
    expect(toParty('DEMOCRATIC')).toBe('Democrat')
    expect(toParty('republican')).toBe('Republican')
    expect(toParty('REPUBLICAN')).toBe('Republican')
  })

  it('handles single-letter abbreviations', () => {
    expect(toParty('D')).toBe('Democrat')
    expect(toParty('R')).toBe('Republican')
    expect(toParty('  d  ')).toBe('Democrat')
  })

  it('falls back to Independent for null, empty, or unknown values', () => {
    expect(toParty(null)).toBe('Independent')
    expect(toParty(undefined)).toBe('Independent')
    expect(toParty('')).toBe('Independent')
    expect(toParty('GOP')).toBe('Independent')
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
