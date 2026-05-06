// lib/integrations/congress/sponsored-bills.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapStatus } from '@/lib/bills'
import { formatBillType } from '@/lib/format'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE    = 'https://api.congress.gov/v3'

interface CongressSponsoredBill {
  congress?: number
  type?: string
  number?: number
  title?: string
  introducedDate?: string
  latestAction?: { actionDate?: string; text?: string }
  policyArea?: { name?: string }
}

export async function fetchSponsoredBills(bioguideId: string, supabase: SupabaseClient) {
  if (!CONGRESS_API_KEY) return []
  const res = await fetch(
    `${CONGRESS_BASE}/member/${bioguideId}/sponsored-legislation?format=json&limit=10&api_key=${CONGRESS_API_KEY}`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return []
  const data = await res.json()
  const bills = ((data.sponsoredLegislation ?? []) as CongressSponsoredBill[])
    .filter((b): b is CongressSponsoredBill & { congress: number; type: string; number: number } => !!(b.congress && b.type && b.number))
    .map((b) => ({
    id:     `${b.congress}-${b.type.toLowerCase()}-${b.number}`,
    name:   b.title ?? '',
    number: `${formatBillType(b.type)} ${b.number}`,
    date:   b.introducedDate
      ? new Date(b.introducedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : '',
    _fallbackStatus: mapStatus(b.latestAction?.text, b.introducedDate),
  }))

  // Look up statuses from DB (source of truth)
  const billIds = bills.map((b) => b.id)
  const { data: dbRows } = billIds.length > 0
    ? await supabase.from('bills').select('bill_id, status').in('bill_id', billIds)
    : { data: [] }
  const statusMap = new Map<string, string>((dbRows ?? []).map((r: { bill_id: string; status: string }) => [r.bill_id, r.status]))

  return bills.map(({ _fallbackStatus, ...b }) => ({
    ...b,
    status: statusMap.get(b.id) ?? _fallbackStatus,
  }))
}
