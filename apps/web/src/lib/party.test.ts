import { describe, it, expect } from 'vitest'
import { toParty, partyAbbrev } from './party'

describe('toParty', () => {
  it('converts "D" to Democrat', () => {
    expect(toParty('D')).toBe('Democrat')
  })

  it('converts "R" to Republican', () => {
    expect(toParty('R')).toBe('Republican')
  })

  it('converts "I" to Independent', () => {
    expect(toParty('I')).toBe('Independent')
  })

  it('passes through full party names', () => {
    expect(toParty('Democrat')).toBe('Democrat')
    expect(toParty('Republican')).toBe('Republican')
  })

  it('handles case-insensitive input', () => {
    expect(toParty('democrat')).toBe('Democrat')
    expect(toParty('REPUBLICAN')).toBe('Republican')
    expect(toParty('d')).toBe('Democrat')
    expect(toParty('r')).toBe('Republican')
  })

  it('returns Independent for null/undefined', () => {
    expect(toParty(null)).toBe('Independent')
    expect(toParty(undefined)).toBe('Independent')
  })

  it('returns Independent for empty string', () => {
    expect(toParty('')).toBe('Independent')
  })

  it('returns Independent for unknown values', () => {
    expect(toParty('Libertarian')).toBe('Independent')
    expect(toParty('Green')).toBe('Independent')
  })
})

describe('partyAbbrev', () => {
  it('abbreviates Democrat to D', () => {
    expect(partyAbbrev('Democrat')).toBe('D')
  })

  it('abbreviates Republican to R', () => {
    expect(partyAbbrev('Republican')).toBe('R')
  })

  it('abbreviates Independent to I', () => {
    expect(partyAbbrev('Independent')).toBe('I')
  })
})
