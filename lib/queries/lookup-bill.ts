import { sql } from '@/lib/db'

export type BillRow = {
  bill_id: string
  congress: number
  title: string
  summary: string | null
  combined_text: string | null
  synced_at: string | null
  topics: string[]
  status: string | null
  bill_number: string | null
  sponsor_name: string | null
  sponsor_bioguide_id: string | null
  sponsor_party: string | null
  introduced_date: string | null
  policy_area: string | null
  congress_gov_url: string | null
  last_action_text: string | null
  last_action_date: string | null
  referenced_agencies: string[] | null
  referenced_laws: string[] | null
  referenced_usc: string[] | null
}

/** Exact-match lookup by bill_id or bill_number. Mirrors the former
 *  `lookup_bill` RPC. */
export async function lookupBill(queryText: string): Promise<BillRow[]> {
  const q = queryText.trim()
  const rows = await sql<BillRow[]>`
    SELECT *
    FROM bills
    WHERE bill_id = ${q.toLowerCase()}
       OR UPPER(bill_number) = ${q.toUpperCase()}
    LIMIT 1
  `
  return [...rows]
}
