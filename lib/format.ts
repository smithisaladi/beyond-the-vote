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
    // Short words (≤3 chars) auto-uppercase unless excluded
    if (lower.length <= 3 && !SHORT_WORD_EXCLUSIONS.has(lower)) return upper
    // Excluded short words stay lowercase (except at start of string)
    if (SHORT_WORD_EXCLUSIONS.has(lower) && offset > 0) return lower
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })
}

/** Abbreviate money for dense list views: $1.2M, $340K, $850. */
export function formatTotal(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

const BILL_TYPE_LABELS: Record<string, string> = {
  hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.',
  hconres: 'H.Con.Res.', sconres: 'S.Con.Res.', hres: 'H.Res.', sres: 'S.Res.',
}

export function formatBillType(type: string): string {
  return BILL_TYPE_LABELS[type.toLowerCase()] ?? type.toUpperCase()
}
