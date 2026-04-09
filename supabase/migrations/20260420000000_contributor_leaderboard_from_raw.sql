-- Rewrite contributor_leaderboard to compute totals from raw FEC tables
-- (pac_to_candidate + independent_expenditures) so that leaderboard totals
-- match the pac_detail page, which also uses raw data.
-- Previously this queried the derived legislator_top_contributors table
-- which only contained a truncated subset per legislator.

DROP FUNCTION IF EXISTS public.contributor_leaderboard(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.contributor_leaderboard(
  search_text  TEXT    DEFAULT NULL,
  result_limit INT    DEFAULT 20,
  offset_count INT    DEFAULT 0
)
RETURNS TABLE (
  cmte_id             TEXT,
  cmte_name           TEXT,
  direct_total        NUMERIC,
  ie_for_total        NUMERIC,
  ie_against_total    NUMERIC,
  total_contributions NUMERIC,
  recipient_count     BIGINT,
  top_recipients      JSONB,
  total_count         BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH skip_names AS (
    SELECT unnest(ARRAY[
      'ACTBLUE', 'WINRED',
      'DEMOCRATIC SENATORIAL CAMPAIGN COMMITTEE', 'DSCC',
      'DEMOCRATIC CONGRESSIONAL CAMPAIGN COMMITTEE', 'DCCC',
      'NRSC', 'NRCC',
      'NATIONAL REPUBLICAN SENATORIAL COMMITTEE',
      'NATIONAL REPUBLICAN CONGRESSIONAL COMMITTEE',
      'DEMOCRATIC NATIONAL COMMITTEE', 'DNC',
      'REPUBLICAN NATIONAL COMMITTEE', 'RNC',
      'SENATE MAJORITY PAC', 'HOUSE MAJORITY PAC',
      'SENATE LEADERSHIP FUND', 'CONGRESSIONAL LEADERSHIP FUND',
      'EMILY''S LIST', 'END CITIZENS UNITED'
    ]) AS name
  ),
  -- Direct PAC-to-candidate contributions per committee
  direct AS (
    SELECT
      p.cmte_id,
      p.cand_id,
      SUM(p.transaction_amt) AS direct_amt
    FROM public.pac_to_candidate p
    GROUP BY p.cmte_id, p.cand_id
  ),
  -- Independent expenditures per committee
  ies AS (
    SELECT
      ie.cmte_id,
      ie.cand_id,
      SUM(CASE WHEN ie.sup_opp = 'S' THEN ie.transaction_amt ELSE 0 END) AS ie_for,
      SUM(CASE WHEN ie.sup_opp = 'O' THEN ie.transaction_amt ELSE 0 END) AS ie_against
    FROM public.independent_expenditures ie
    GROUP BY ie.cmte_id, ie.cand_id
  ),
  -- Combine per (cmte_id, cand_id)
  per_cmte_cand AS (
    SELECT
      COALESCE(d.cmte_id, i.cmte_id) AS cmte_id,
      COALESCE(d.cand_id, i.cand_id) AS cand_id,
      COALESCE(d.direct_amt, 0)      AS direct_amt,
      COALESCE(i.ie_for, 0)          AS ie_for,
      COALESCE(i.ie_against, 0)      AS ie_against,
      COALESCE(d.direct_amt, 0) + COALESCE(i.ie_for, 0) AS total_support
    FROM direct d
    FULL OUTER JOIN ies i ON d.cmte_id = i.cmte_id AND d.cand_id = i.cand_id
  ),
  -- Aggregate per committee
  agg AS (
    SELECT
      pc.cmte_id,
      SUM(pc.direct_amt)  AS direct_total,
      SUM(pc.ie_for)      AS ie_for_total,
      SUM(pc.ie_against)  AS ie_against_total,
      SUM(pc.direct_amt) + SUM(pc.ie_for) + SUM(pc.ie_against) AS total_contributions,
      COUNT(DISTINCT pc.cand_id) FILTER (WHERE pc.total_support > 0) AS recipient_count
    FROM per_cmte_cand pc
    GROUP BY pc.cmte_id
  ),
  -- Resolve committee name (best available)
  named AS (
    SELECT
      a.*,
      COALESCE(
        (SELECT MAX(tp.cmte_name) FROM public.legislator_top_pacs tp WHERE tp.cmte_id = a.cmte_id),
        a.cmte_id
      ) AS cmte_name
    FROM agg a
  ),
  -- Apply filters and skip pass-through entities
  filtered AS (
    SELECT *
    FROM named n
    WHERE UPPER(TRIM(n.cmte_name)) NOT IN (SELECT name FROM skip_names)
      AND (search_text IS NULL OR n.cmte_name ILIKE '%' || search_text || '%')
  ),
  counted AS (
    SELECT *, COUNT(*) OVER() AS total_count
    FROM filtered
    ORDER BY total_contributions DESC
    LIMIT result_limit OFFSET offset_count
  )
  SELECT
    c.cmte_id,
    c.cmte_name,
    c.direct_total,
    c.ie_for_total,
    c.ie_against_total,
    c.total_contributions,
    c.recipient_count,
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
            'amount',      pc2.total_support,
            'direct',      pc2.direct_amt,
            'ie_for',      pc2.ie_for
          ) AS r
          FROM per_cmte_cand pc2
          JOIN public.legislators l ON pc2.cand_id = ANY(l.fec_ids)
          WHERE pc2.cmte_id = c.cmte_id AND pc2.total_support > 0
          ORDER BY pc2.total_support DESC
          LIMIT 5
        ) sub
      ),
      '[]'::jsonb
    ) AS top_recipients,
    c.total_count
  FROM counted c;
$$;

GRANT EXECUTE ON FUNCTION public.contributor_leaderboard(TEXT, INT, INT)
  TO anon, authenticated;
