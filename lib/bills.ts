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
  similarity: number
}
