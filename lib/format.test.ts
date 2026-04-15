import { describe, it, expect } from 'vitest'
import { toTitleCase, formatTotal } from './format'

describe('toTitleCase', () => {
  it('title-cases all-caps input', () => {
    expect(toTitleCase('JOHN SMITH')).toBe('John Smith')
  })

  it('leaves mixed-case input untouched (trimmed)', () => {
    expect(toTitleCase('John Smith')).toBe('John Smith')
    expect(toTitleCase('  Jane Doe  ')).toBe('Jane Doe')
    expect(toTitleCase('von der Leyen')).toBe('von der Leyen')
  })

  it('preserves acronyms in KEEP_UPPERCASE', () => {
    expect(toTitleCase('AIPAC PAC')).toBe('AIPAC PAC')
    expect(toTitleCase('GOP VICTORY FUND')).toBe('GOP Victory Fund')
    expect(toTitleCase('ACME LLC')).toBe('Acme LLC')
    expect(toTitleCase('SEIU LOCAL 1000')).toBe('SEIU Local 1000')
    expect(toTitleCase('NRA POLITICAL VICTORY FUND')).toBe('NRA Political Victory Fund')
  })

  it('handles empty / whitespace-only strings', () => {
    expect(toTitleCase('')).toBe('')
    expect(toTitleCase('   ')).toBe('')
  })

  it('handles single-word all-caps', () => {
    expect(toTitleCase('GOOGLE')).toBe('Google')
    expect(toTitleCase('PAC')).toBe('PAC') // acronym preserved
  })

  it('preserves apostrophes and re-cases each alphabetic token', () => {
    // Apostrophe splits the word in the regex; both halves get re-cased.
    expect(toTitleCase("O'BRIEN")).toBe("O'Brien")
  })

  it('does not collapse multiple spaces or alter punctuation', () => {
    expect(toTitleCase('SMITH,  JOHN')).toBe('Smith,  John')
    expect(toTitleCase('JOHN SMITH JR.')).toBe('John Smith Jr.')
  })

  it('treats mixed-letter-plus-number words', () => {
    expect(toTitleCase('LOCAL 1000 UNION')).toBe('Local 1000 Union')
  })
})

describe('formatTotal', () => {
  it('formats < $1K as full dollars', () => {
    expect(formatTotal(0)).toBe('$0')
    expect(formatTotal(850)).toBe('$850')
    expect(formatTotal(999)).toBe('$999')
  })

  it('formats $1K to < $1M as K-abbreviated (rounded)', () => {
    expect(formatTotal(1_000)).toBe('$1K')
    expect(formatTotal(1_500)).toBe('$2K') // Math.round
    expect(formatTotal(340_250)).toBe('$340K')
    expect(formatTotal(999_999)).toBe('$1000K')
  })

  it('formats >= $1M as M-abbreviated with 1 decimal', () => {
    expect(formatTotal(1_000_000)).toBe('$1.0M')
    expect(formatTotal(1_200_000)).toBe('$1.2M')
    expect(formatTotal(1_250_000)).toBe('$1.3M')
  })

  it('handles very large values', () => {
    expect(formatTotal(1_500_000_000)).toBe('$1500.0M')
  })

  it('handles negatives as full dollars (boundary not crossed)', () => {
    expect(formatTotal(-500)).toBe('$-500')
  })
})

