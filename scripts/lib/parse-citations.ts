/**
 * Extracts legal citations from bill text.
 *
 * Intentionally conservative — prefers false negatives over false positives
 * to keep referenced_laws arrays clean.
 */

// "42 U.S.C. 7401", "42 U.S.C. § 7401", "42 USC 7401"
const USC_PATTERN = /(\d+)\s*U\.?S\.?C\.?\s*§?\s*(\d+[a-z]?(?:[-–]\d+[a-z]?)?)/gi

// "Clean Air Act", "Higher Education Act of 1965"
// Requires ≥2 capitalized words before "Act" to filter generic references
const ACT_PATTERN = /(?:the\s+)?((?:[A-Z][a-zA-Z]*\s+){1,6}Act(?:\s+of\s+\d{4})?)/g

// "Public Law 117-169", "P.L. 117-169"
const PL_PATTERN = /(?:Public\s+Law|P\.?\s*L\.?)\s*(\d{1,3})[-–](\d{1,4})/gi

// Acts that are generic references, not specific law names
const ACT_BLOCKLIST = new Set([
  'This Act', 'That Act', 'The Act', 'An Act', 'Such Act',
  'Any Act', 'Each Act', 'Every Act',
])

export interface BillCitations {
  uscSections: string[]  // ["42 USC 7401", "20 USC 1001"]
  actNames: string[]     // ["Clean Air Act", "Higher Education Act of 1965"]
  publicLaws: string[]   // ["PL 117-169"]
}

export function extractCitations(text: string): BillCitations {
  const uscSections = new Set<string>()
  const actNames = new Set<string>()
  const publicLaws = new Set<string>()

  let match: RegExpExecArray | null

  USC_PATTERN.lastIndex = 0
  while ((match = USC_PATTERN.exec(text)) !== null) {
    uscSections.add(`${match[1]} USC ${match[2]}`)
  }

  ACT_PATTERN.lastIndex = 0
  while ((match = ACT_PATTERN.exec(text)) !== null) {
    const name = match[1].trim()
    if (!ACT_BLOCKLIST.has(name) && name.split(/\s+/).length >= 2) {
      actNames.add(name)
    }
  }

  PL_PATTERN.lastIndex = 0
  while ((match = PL_PATTERN.exec(text)) !== null) {
    publicLaws.add(`PL ${match[1]}-${match[2]}`)
  }

  return {
    uscSections: [...uscSections].sort(),
    actNames: [...actNames].sort(),
    publicLaws: [...publicLaws].sort(),
  }
}
