export type BillStatus = 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'

/**
 * Derives a display status from Congress.gov latestAction text and introducedDate.
 * Mirrors the logic in app/api/bills/route.ts — kept here so sync scripts can
 * import it without touching app/api/.
 */
export function mapStatus(latestActionText?: string, introducedDate?: string): BillStatus {
  const action = (latestActionText ?? '').toLowerCase()
  if (
    action.includes('became public law') ||
    action.includes('signed by president') ||
    action.includes('passed the senate') ||
    action.includes('passed the house') ||
    action.includes('presented to president')
  ) return 'Passed'
  if (
    action.includes('failed') ||
    action.includes('defeated') ||
    action.includes('vetoed') ||
    action.includes('rejected')
  ) return 'Failed'
  if (action.includes('referred to') || action.includes('committee')) {
    if (introducedDate) {
      const monthsAgo = (Date.now() - new Date(introducedDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (monthsAgo > 6) return 'Stalled'
    }
    return 'Committee'
  }
  return 'Active'
}

const BILL_TYPE_LABELS: Record<string, string> = {
  s:       'S.',
  hr:      'H.R.',
  sjres:   'S.J.Res.',
  hjres:   'H.J.Res.',
  sres:    'S.Res.',
  hres:    'H.Res.',
  sconres: 'S.Con.Res.',
  hconres: 'H.Con.Res.',
}

/**
 * Formats a bill ID for display.
 * Examples:
 *   "119-s-1247"    → "S. 1247"
 *   "119-hr-4521"   → "H.R. 4521"
 *   "119-sjres-12"  → "S.J.Res. 12"
 *   "119-hconres-10"→ "H.Con.Res. 10"
 */
export function formatBillId(billId: string): string {
  const parts = billId.split('-')
  if (parts.length < 3) return billId
  const [, type, number] = parts
  const label = BILL_TYPE_LABELS[type] ?? type.toUpperCase()
  return `${label} ${number}`
}

export interface SmartSearchResult {
  bill_id: string
  congress: number
  title: string
  summary: string | null
  similarity: number | null
}
