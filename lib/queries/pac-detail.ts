import { sql } from '@/lib/db'

export type PacDetailRecipient = {
  bioguide_id: string
  name: string
  party: string
  state: string
  chamber: string
  amount: number
  direct: number
  ie_for: number
}

export type PacDetailRow = {
  cmte_id: string
  cmte_name: string | null
  connected_org: string | null
  total_contributions: number
  direct_total: number
  ie_for_total: number
  ie_against_total: number
  recipient_count: number
  recipients: PacDetailRecipient[]
}

/** PAC detail aggregation: totals + top 20 recipients. Mirrors the former
 *  `pac_detail` RPC. Returns exactly one row. */
export async function pacDetail(targetCmteId: string): Promise<PacDetailRow[]> {
  const rows = await sql<PacDetailRow[]>`
    WITH cmte_info AS (
      SELECT
        MAX(cn.cmte_name)     AS cmte_name,
        MAX(cn.connected_org) AS connected_org
      FROM fec_cmte_names cn
      WHERE cn.cmte_id = ${targetCmteId}
    ),
    direct AS (
      SELECT
        p.cand_id,
        SUM(p.transaction_amt) AS direct_amt
      FROM pac_to_candidate p
      WHERE p.cmte_id = ${targetCmteId}
      GROUP BY p.cand_id
    ),
    ies AS (
      SELECT
        ie.cand_id,
        SUM(CASE WHEN ie.sup_opp = 'S' THEN ie.transaction_amt ELSE 0 END) AS ie_for,
        SUM(CASE WHEN ie.sup_opp = 'O' THEN ie.transaction_amt ELSE 0 END) AS ie_against
      FROM independent_expenditures ie
      WHERE ie.cmte_id = ${targetCmteId}
      GROUP BY ie.cand_id
    ),
    per_candidate AS (
      SELECT
        COALESCE(d.cand_id, i.cand_id) AS cand_id,
        COALESCE(d.direct_amt, 0)      AS direct_amt,
        COALESCE(i.ie_for, 0)          AS ie_for,
        COALESCE(i.ie_against, 0)      AS ie_against,
        COALESCE(d.direct_amt, 0) + COALESCE(i.ie_for, 0) AS total_support
      FROM direct d
      FULL OUTER JOIN ies i ON d.cand_id = i.cand_id
    ),
    totals AS (
      SELECT
        COALESCE(SUM(direct_amt), 0)                                       AS direct_total,
        COALESCE(SUM(ie_for), 0)                                           AS ie_for_total,
        COALESCE(SUM(ie_against), 0)                                       AS ie_against_total,
        COALESCE(SUM(total_support), 0)                                    AS total_contributions,
        COUNT(DISTINCT cand_id) FILTER (WHERE total_support > 0)           AS recipient_count
      FROM per_candidate
    )
    SELECT
      ${targetCmteId}::text AS cmte_id,
      ci.cmte_name,
      ci.connected_org,
      t.total_contributions,
      t.direct_total,
      t.ie_for_total,
      t.ie_against_total,
      t.recipient_count,
      COALESCE(
        (
          SELECT jsonb_agg(r ORDER BY (r->>'amount')::numeric DESC)
          FROM (
            SELECT jsonb_build_object(
              'bioguide_id', l.bioguide_id,
              'name',        l.full_name,
              'party',       l.party,
              'state',       l.state,
              'chamber',     l.chamber,
              'amount',      pc.total_support,
              'direct',      pc.direct_amt,
              'ie_for',      pc.ie_for
            ) AS r
            FROM per_candidate pc
            JOIN legislators l
              ON pc.cand_id = ANY(l.fec_ids)
            WHERE pc.total_support > 0
            ORDER BY pc.total_support DESC
            LIMIT 20
          ) sub
        ),
        '[]'::jsonb
      ) AS recipients
    FROM totals t
    CROSS JOIN cmte_info ci
  `
  return [...rows]
}
