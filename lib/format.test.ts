import { describe, it, expect } from 'vitest'
import { toTitleCase, formatTotal, formatAmount, isUninformativeName } from './format'

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

describe('formatAmount', () => {
  it('formats with thousands separators', () => {
    expect(formatAmount(0)).toBe('$0')
    expect(formatAmount(850)).toBe('$850')
    expect(formatAmount(40_134_927)).toBe('$40,134,927')
  })

  it('rounds fractional amounts', () => {
    expect(formatAmount(100.49)).toBe('$100')
    expect(formatAmount(100.5)).toBe('$101')
  })

  it('handles negatives', () => {
    expect(formatAmount(-500)).toBe('$-500')
  })
})

describe('isUninformativeName', () => {
  it.each(['Other', 'N/A', 'None', 'Various', 'Unknown', 'Na'])(
    'returns true for %s',
    v => expect(isUninformativeName(v)).toBe(true),
  )

  it('is case-sensitive (lowercase not filtered)', () => {
    // Documents current behavior; if we ever want case-insensitive, update here + source.
    expect(isUninformativeName('other')).toBe(false)
    expect(isUninformativeName('UNKNOWN')).toBe(false)
  })

  it('returns false for whitespace or unrelated names', () => {
    expect(isUninformativeName('')).toBe(false)
    expect(isUninformativeName(' Other ')).toBe(false)
    expect(isUninformativeName('Acme Corp')).toBe(false)
  })
})
