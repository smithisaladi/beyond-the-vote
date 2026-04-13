import { sql } from '@/lib/db'

export type BillsByTopicRow = {
  bill_id: string
  congress: number
  title: string
  summary: string | null
  bill_number: string | null
  status: string | null
  topics: string[]
}

/** Bills tagged with a given topic slug, most recently synced first.
 *  Mirrors the former `get_bills_by_topic` RPC. */
export async function getBillsByTopic(
  topicSlug: string,
  matchCount = 20,
  statusFilter: string | null = null,
): Promise<BillsByTopicRow[]> {
  const rows = await sql<BillsByTopicRow[]>`
    SELECT bill_id, congress, title, summary, bill_number, status, topics
    FROM bills
    WHERE topics @> ARRAY[${topicSlug}]::text[]
      AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
    ORDER BY synced_at DESC NULLS LAST
    LIMIT ${matchCount}
  `
  return [...rows]
}
