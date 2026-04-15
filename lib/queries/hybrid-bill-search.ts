import { sql } from '@/lib/db'

export type HybridBillSearchRow = {
  bill_id: string
  congress: number
  title: string
  bill_number: string | null
  status: string | null
  summary: string | null
  sponsor_name: string | null
  sponsor_bioguide_id: string | null
  sponsor_party: string | null
  introduced_date: string | null
  policy_area: string | null
  congress_gov_url: string | null
  last_action_text: string | null
  last_action_date: string | null
  topics: string[]
  rrf_score: number
}

export type HybridBillSearchParams = {
  queryText: string
  resultLimit?: number
  offsetCount?: number
  statusFilter?: string | null
  topicFilters?: string[] | null
  policyAreas?: string[] | null
  congressFilter?: number | null
  billIds?: string[] | null
}

/** Hybrid full-text + trigram search with Reciprocal Rank Fusion. Mirrors the
 *  former `hybrid_bill_search` RPC 1:1 — uses `search_vector` GIN index for
 *  FTS and the `title` GIN trigram index for fuzzy matching. */
export async function hybridBillSearch({
  queryText,
  resultLimit = 20,
  offsetCount = 0,
  statusFilter = null,
  topicFilters = null,
  policyAreas = null,
  congressFilter = null,
  billIds = null,
}: HybridBillSearchParams): Promise<HybridBillSearchRow[]> {
  const rows = await sql<HybridBillSearchRow[]>`
    WITH tsq AS (
      SELECT websearch_to_tsquery('english', ${queryText}) AS q
    ),
    fts AS (
      SELECT b.bill_id,
             ROW_NUMBER() OVER (
               ORDER BY ts_rank_cd(b.search_vector, (SELECT q FROM tsq)) DESC
             ) AS rank
      FROM bills b
      WHERE b.search_vector @@ (SELECT q FROM tsq)
        AND (${statusFilter}::text    IS NULL OR b.status      = ${statusFilter})
        AND (${topicFilters}::text[]  IS NULL OR b.topics      && ${topicFilters}::text[])
        AND (${policyAreas}::text[]   IS NULL OR b.policy_area = ANY(${policyAreas}))
        AND (${congressFilter}::int   IS NULL OR b.congress    = ${congressFilter})
        AND (${billIds}::text[]       IS NULL OR b.bill_id     = ANY(${billIds}))
      LIMIT 40
    ),
    trgm AS (
      SELECT b.bill_id,
             ROW_NUMBER() OVER (
               ORDER BY similarity(b.title, ${queryText}) DESC
             ) AS rank
      FROM bills b
      WHERE similarity(b.title, ${queryText}) > 0.1
        AND (${statusFilter}::text    IS NULL OR b.status      = ${statusFilter})
        AND (${topicFilters}::text[]  IS NULL OR b.topics      && ${topicFilters}::text[])
        AND (${policyAreas}::text[]   IS NULL OR b.policy_area = ANY(${policyAreas}))
        AND (${congressFilter}::int   IS NULL OR b.congress    = ${congressFilter})
        AND (${billIds}::text[]       IS NULL OR b.bill_id     = ANY(${billIds}))
      LIMIT 20
    ),
    fused AS (
      SELECT
        COALESCE(f.bill_id, t.bill_id) AS bill_id,
        (1.0 / (60.0 + COALESCE(f.rank, 999)::float))
        + (0.5 / (60.0 + COALESCE(t.rank, 999)::float)) AS rrf_score
      FROM fts f
      FULL OUTER JOIN trgm t USING (bill_id)
    )
    SELECT
      b.bill_id,
      b.congress,
      b.title,
      b.bill_number,
      b.status,
      LEFT(b.summary, 400) AS summary,
      b.sponsor_name,
      b.sponsor_bioguide_id,
      b.sponsor_party,
      b.introduced_date,
      b.policy_area,
      b.congress_gov_url,
      b.last_action_text,
      b.last_action_date,
      b.topics,
      fu.rrf_score
    FROM fused fu
    JOIN bills b ON b.bill_id = fu.bill_id
    ORDER BY fu.rrf_score DESC
    LIMIT ${resultLimit} OFFSET ${offsetCount}
  `
  return [...rows]
}
