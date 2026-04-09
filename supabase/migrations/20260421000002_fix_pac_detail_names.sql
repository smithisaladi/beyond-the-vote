-- Fix pac_detail name resolution: use fec_cmte_names instead of legislator_top_pacs

DROP FUNCTION IF EXISTS public.pac_detail(TEXT);

CREATE OR REPLACE FUNCTION public.pac_detail(
  target_cmte_id TEXT
)
RETURNS TABLE (
  cmte_id             TEXT,
  cmte_name           TEXT,
  connected_org       TEXT,
  total_contributions NUMERIC,
  direct_total        NUMERIC,
  ie_for_total        NUMERIC,
  ie_against_total    NUMERIC,
  recipient_count     BIGINT,
  recipients          JSONB
)
LANGUAGE sql STABLE
AS $$
  -- Get committee name/org from fec_cmte_names lookup
  WITH cmte_info AS (
    SELECT
      cn.cmte_name,
      cn.connected_org
    FROM public.fec_cmte_names cn
    WHERE cn.cmte_id = target_cmte_id
  ),
  -- Direct PAC-to-candidate contributions (full, not limited to top 20)
  direct AS (
    SELECT
      p.cand_id,
      SUM(p.transaction_amt) AS direct_amt
    FROM public.pac_to_candidate p
    WHERE p.cmte_id = target_cmte_id
    GROUP BY p.cand_id
  ),
  -- Independent expenditures (full, not limited to top 20)
  ies AS (
    SELECT
      ie.cand_id,
      SUM(CASE WHEN ie.sup_opp = 'S' THEN ie.transaction_amt ELSE 0 END) AS ie_for,
      SUM(CASE WHEN ie.sup_opp = 'O' THEN ie.transaction_amt ELSE 0 END) AS ie_against
    FROM public.independent_expenditures ie
    WHERE ie.cmte_id = target_cmte_id
    GROUP BY ie.cand_id
  ),
  -- Combine direct + IE per candidate
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
  -- Grand totals across ALL candidates
  totals AS (
    SELECT
      SUM(direct_amt)    AS direct_total,
      SUM(ie_for)        AS ie_for_total,
      SUM(ie_against)    AS ie_against_total,
      SUM(total_support) AS total_contributions,
      COUNT(DISTINCT cand_id) FILTER (WHERE total_support > 0) AS recipient_count
    FROM per_candidate
  )
  SELECT
    target_cmte_id AS cmte_id,
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
          JOIN public.legislators l
            ON pc.cand_id = ANY(l.fec_ids)
          WHERE pc.total_support > 0
          ORDER BY pc.total_support DESC
          LIMIT 20
        ) sub
      ),
      '[]'::jsonb
    ) AS recipients
  FROM totals t
  CROSS JOIN cmte_info ci;
$$;

GRANT EXECUTE ON FUNCTION public.pac_detail(TEXT)
  TO anon, authenticated;
