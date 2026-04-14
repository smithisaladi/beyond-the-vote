// Formatting helpers shared across representative/donor/bill surfaces.
// Keep this file dependency-free so it can be imported from server & client
// components alike.

const UNINFORMATIVE_NAMES = new Set(['Other', 'N/A', 'None', 'Various', 'Unknown', 'Na'])

/**
 * Tokens that should stay uppercase inside a title-cased name. Mostly
 * acronyms that appear inside FEC committee names and PAC org names.
 * Add sparingly — only tokens that are genuinely ambiguous when lowercased.
 */
const KEEP_UPPERCASE = new Set([
  // Legal / corporate structure
  'DBA', 'LLC', 'LLP', 'LP', 'PLLC', 'PC', 'PAC', 'SUPERPAC', 'IE',
  // Political orgs & committees
  'AFP', 'AIPAC', 'CVA', 'GOP', 'RNC', 'DNC', 'NRSC', 'DSCC', 'DCCC', 'NRCC',
  'NRA', 'AARP', 'NAACP', 'ACLU', 'AFL', 'CIO', 'NEA', 'SEIU', 'UAW',
  'AFSCME', 'NFIB', 'AFT', 'IBEW', 'UFCW', 'USPS', 'FOP', 'IAFF',
  // Country / region
  'USA', 'US', 'UK', 'EU',
  // Common business abbreviations
  'IBM', 'AT&T', 'UPS', 'GE', 'HP', 'ESPN', 'CNN', 'NBC', 'CBS', 'ABC', 'PBS',
  'NBA', 'NFL', 'MLB', 'NHL', 'NCAA', 'FIFA',
  // Agencies
  'FBI', 'CIA', 'IRS', 'SEC', 'FDA', 'EPA', 'DOJ', 'DOD', 'DOE', 'DHS',
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
  return t.replace(/[A-Za-z&]+/g, word => {
    const upper = word.toUpperCase()
    if (KEEP_UPPERCASE.has(upper)) return upper
    const lower = word.toLowerCase()
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })
}

/** Abbreviate money for dense list views: $1.2M, $340K, $850. */
export function formatTotal(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

/** Full dollar amount with thousands separators: $40,134,927. */
export function formatAmount(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function isUninformativeName(s: string): boolean {
  return UNINFORMATIVE_NAMES.has(s)
}
