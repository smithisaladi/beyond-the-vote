import { describe, it, expect } from 'vitest'
import {
  toTitleCase,
  formatTotal,
  formatBillType,
  decodeHtmlEntities,
  parseLocalDate,
  formatDate,
  formatShortDate,
  ordinal,
} from './format'

describe('toTitleCase', () => {
  it('converts FEC all-caps names to title case', () => {
    expect(toTitleCase('SMITH, JOHN A.')).toBe('Smith, John a.')
  })

  it('leaves mixed-case strings alone', () => {
    expect(toTitleCase('Already Mixed')).toBe('Already Mixed')
  })

  it('keeps KEEP_UPPERCASE acronyms uppercase', () => {
    expect(toTitleCase('FRIENDS OF AIPAC')).toBe('Friends of AIPAC')
    expect(toTitleCase('SEIU LOCAL FUND')).toBe('SEIU Local Fund')
  })

  it('lowercases short word exclusions (of, the, a) except at start', () => {
    expect(toTitleCase('FRIENDS OF THE EARTH')).toBe('Friends of the Earth')
    expect(toTitleCase('THE COMMITTEE FOR CHANGE')).toBe('The Committee for Change')
  })

  it('title-cases suffixes Jr. and Sr.', () => {
    expect(toTitleCase('SMITH JR')).toBe('Smith Jr')
    expect(toTitleCase('JONES SR')).toBe('Jones Sr')
  })

  it('auto-uppercases short words not in exclusion list', () => {
    // "PAC" is 3 chars and not in SHORT_WORD_EXCLUSIONS → uppercase
    expect(toTitleCase('SOME PAC NAME')).toBe('Some PAC Name')
  })

  it('handles empty and whitespace strings', () => {
    expect(toTitleCase('')).toBe('')
    expect(toTitleCase('   ')).toBe('')
  })
})

describe('formatTotal', () => {
  it('formats millions', () => {
    expect(formatTotal(1_200_000)).toBe('$1.2M')
    expect(formatTotal(5_500_000)).toBe('$5.5M')
  })

  it('formats thousands', () => {
    expect(formatTotal(340_000)).toBe('$340K')
    expect(formatTotal(1_500)).toBe('$2K')
  })

  it('formats hundreds', () => {
    expect(formatTotal(850)).toBe('$850')
  })

  it('formats zero', () => {
    expect(formatTotal(0)).toBe('$0')
  })

  it('formats negative values', () => {
    expect(formatTotal(-500)).toBe('$-500')
  })
})

describe('formatBillType', () => {
  it('maps hr to H.R.', () => {
    expect(formatBillType('hr')).toBe('H.R.')
  })

  it('maps s to S.', () => {
    expect(formatBillType('s')).toBe('S.')
  })

  it('maps sjres to S.J.Res.', () => {
    expect(formatBillType('sjres')).toBe('S.J.Res.')
  })

  it('falls back to uppercase for unknown types', () => {
    expect(formatBillType('xyz')).toBe('XYZ')
  })

  it('is case-insensitive', () => {
    expect(formatBillType('HR')).toBe('H.R.')
    expect(formatBillType('S')).toBe('S.')
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes &amp; to &', () => {
    expect(decodeHtmlEntities('Smith &amp; Jones')).toBe('Smith & Jones')
  })

  it('decodes &lt; and &gt;', () => {
    expect(decodeHtmlEntities('&lt;b&gt;bold&lt;/b&gt;')).toBe('<b>bold</b>')
  })

  it('decodes &quot; and &#39;', () => {
    expect(decodeHtmlEntities('&quot;hello&#39;s&quot;')).toBe('"hello\'s"')
  })

  it('decodes numeric entities', () => {
    expect(decodeHtmlEntities('&#65;&#66;')).toBe('AB')
  })

  it('collapses whitespace and trims', () => {
    expect(decodeHtmlEntities('  hello   world  ')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(decodeHtmlEntities('')).toBe('')
  })
})

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD as local time', () => {
    const d = parseLocalDate('2024-01-15')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(0) // January
    expect(d.getDate()).toBe(15)
  })

  it('handles non-date-only strings by delegating to Date constructor', () => {
    const d = parseLocalDate('2024-01-15T12:00:00Z')
    expect(d instanceof Date).toBe(true)
    expect(isNaN(d.getTime())).toBe(false)
  })
})

describe('formatDate', () => {
  it('formats a valid date as long form', () => {
    expect(formatDate('2024-01-15')).toBe('January 15, 2024')
  })

  it('formats another date correctly', () => {
    expect(formatDate('2023-12-25')).toBe('December 25, 2023')
  })
})

describe('formatShortDate', () => {
  it('formats a valid date as short form', () => {
    expect(formatShortDate('2024-01-15')).toBe('Jan 15, 2024')
  })

  it('formats another date correctly', () => {
    expect(formatShortDate('2023-12-25')).toBe('Dec 25, 2023')
  })
})

describe('ordinal', () => {
  it('returns At-Large for 0', () => {
    expect(ordinal(0)).toBe('At-Large')
  })

  it('returns 1st District for 1', () => {
    expect(ordinal(1)).toBe('1st District')
  })

  it('returns 2nd District for 2', () => {
    expect(ordinal(2)).toBe('2nd District')
  })

  it('returns 3rd District for 3', () => {
    expect(ordinal(3)).toBe('3rd District')
  })

  it('returns 4th District for 4', () => {
    expect(ordinal(4)).toBe('4th District')
  })

  it('returns 11th District for 11', () => {
    expect(ordinal(11)).toBe('11th District')
  })

  it('returns 12th District for 12', () => {
    expect(ordinal(12)).toBe('12th District')
  })

  it('returns 13th District for 13', () => {
    expect(ordinal(13)).toBe('13th District')
  })

  it('returns 21st District for 21', () => {
    expect(ordinal(21)).toBe('21st District')
  })
})
