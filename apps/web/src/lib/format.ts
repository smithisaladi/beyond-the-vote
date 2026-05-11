// Formatting helpers shared across representative/donor/bill surfaces.
// Keep this file dependency-free so it can be imported from server & client
// components alike.

/**
 * Acronyms 4+ letters that should stay uppercase. Short (≤3 char) words are
 * auto-uppercased unless they appear in SHORT_WORD_EXCLUSIONS below.
 */
const KEEP_UPPERCASE = new Set([
  'AIPAC', 'AARP', 'NAACP', 'ACLU', 'SEIU', 'AFSCME', 'NFIB',
  'IBEW', 'UFCW', 'USPS', 'IAFF', 'AT&T', 'ESPN', 'NCAA', 'FIFA',
  'PLLC', 'SUPERPAC',
])

/**
 * Short words (≤3 chars) that should NOT be auto-uppercased. These are common
 * English words that would look wrong in all caps (e.g. "Inc", "the", "for").
 */
const SHORT_WORD_EXCLUSIONS = new Set([
  // Articles, conjunctions, prepositions
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in',
  'los', 'nor', 'not', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'via', 'yet', 'you',
  // Common short non-acronym words
  'inc', 'ltd', 'act', 'co', 'no', 'we', 'our', 'its', 'new', 'one',
  'all', 'any', 'his', 'her', 'who', 'how', 'did', 'has', 'had', 'was',
  'are', 'can', 'may', 'win', 'do', 'is', 'it', 'my', 'he', 'me',
])

/**
 * Short name suffixes that should be title-cased ("Jr.", "Sr.") rather than
 * auto-uppercased. Roman numeral suffixes (II, III, IV) are intentionally
 * omitted — those should stay uppercase.
 */
const TITLE_CASE_SUFFIXES = new Set(['jr', 'sr'])

/**
 * FEC data arrives SHOUTING IN ALL CAPS. Convert to Title Case unless the
 * original was already mixed-case (in which case we assume human editing and
 * leave it alone). Acronyms in KEEP_UPPERCASE stay uppercase so "DBA"
 * doesn't become "Dba".
 */
export function toTitleCase(s: string): string {
  const t = s.trim()
  if (t !== t.toUpperCase()) return t
  return t.replace(/[A-Za-z&]+/g, (word, offset) => {
    const upper = word.toUpperCase()
    if (KEEP_UPPERCASE.has(upper)) return upper
    const lower = word.toLowerCase()
    // Short words (≤3 chars) auto-uppercase unless excluded or a title-cased suffix
    if (lower.length <= 3 && !SHORT_WORD_EXCLUSIONS.has(lower) && !TITLE_CASE_SUFFIXES.has(lower)) return upper
    // Excluded short words stay lowercase (except at start of string)
    if (SHORT_WORD_EXCLUSIONS.has(lower) && offset > 0) return lower
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })
}

/** Format a district number as an ordinal string, e.g. "1st District", "At-Large". */
export function ordinal(n: number): string {
  if (n === 0) return 'At-Large'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + ' District'
}

/** Abbreviate money for dense list views: $1.2M, $340K, $850. */
export function formatTotal(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

import { BILL_TYPE_LABELS } from '@/lib/bills'

export function formatBillType(type: string): string {
  return BILL_TYPE_LABELS[type.toLowerCase()] ?? type.toUpperCase()
}

/**
 * Parse a date-only string (YYYY-MM-DD) as local time instead of UTC.
 * Prevents the off-by-one-day bug where `new Date('2024-01-15')` shows Jan 14 in US timezones.
 */
/**
 * Decode common HTML entities left over after stripping tags from Congress.gov summaries.
 */
export function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseLocalDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00')
  }
  return new Date(dateStr)
}

/** Format a date string as "January 15, 2024". */
export function formatDate(dateStr: string): string {
  try {
    return parseLocalDate(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/** Format a date string as "Jan 15, 2024". */
export function formatShortDate(dateStr: string): string {
  try {
    return parseLocalDate(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}
