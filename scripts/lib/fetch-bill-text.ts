/**
 * Fetches bill text XML from govinfo.gov.
 *
 * Package ID format: BILLS-{congress}{type}{number}{version}
 * Example: BILLS-119s1247is (introduced version of S. 1247, 119th Congress)
 *
 * Versions in priority order (most processed first):
 *   enr = enrolled (sent to President)
 *   es/eh = engrossed (passed a chamber)
 *   rs/rh = reported by committee
 *   is/ih = introduced
 */

const VERSION_PRIORITY = ['enr', 'es', 'eh', 'rs', 'rh', 'is', 'ih'] as const

export async function fetchBillTextXml(
  congress: number,
  type: string,   // "s", "hr", "hjres", etc.
  number: number | string,
): Promise<string | null> {
  for (const version of VERSION_PRIORITY) {
    const packageId = `BILLS-${congress}${type.toLowerCase()}${number}${version}`
    const url = `https://www.govinfo.gov/content/pkg/${packageId}/xml/${packageId}.xml`

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (res.ok) return await res.text()
    } catch {
      // Version doesn't exist or timed out — try next
    }
  }

  return null
}

/**
 * Extracts plain text from bill XML for entity extraction.
 * Targets the <legis-body> or <resolution-body> element.
 */
export function extractTextFromBillXml(xml: string): string {
  const bodyMatch = xml.match(
    /<(?:legis-body|resolution-body)[^>]*>([\s\S]*?)<\/(?:legis-body|resolution-body)>/,
  )

  if (!bodyMatch) {
    // Fall back to stripping all tags from the full document
    return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  return bodyMatch[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
