-- Contributor leaderboard: aggregates legislator_top_contributors across all
-- legislators to show which organizations contribute the most to Congress overall.
-- Mirrors pac_leaderboard but uses the combined individual+PAC org-level data.

CREATE INDEX IF NOT EXISTS idx_top_contributors_org_name
  ON public.legislator_top_contributors(org_name);

CREATE OR REPLACE FUNCTION public.contributor_leaderboard(
  search_text  TEXT    DEFAULT NULL,
  result_limit INT    DEFAULT 20,
  offset_count INT    DEFAULT 0
)
RETURNS TABLE (
  org_name            TEXT,
  cmte_id             TEXT,
  total_individual    NUMERIC,
  total_pac           NUMERIC,
  total_contributions NUMERIC,
  recipient_count     BIGINT,
  top_recipients      JSONB,
  total_count         BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH agg AS (
    SELECT
      tc.org_name,
      SUM(tc.individual_total)  AS total_individual,
      SUM(tc.pac_total)         AS total_pac,
      SUM(tc.grand_total)       AS total_contributions,
      COUNT(DISTINCT tc.bioguide_id) AS recipient_count
    FROM public.legislator_top_contributors tc
    WHERE (search_text IS NULL OR tc.org_name ILIKE '%' || search_text || '%')
    GROUP BY tc.org_name
  ),
  counted AS (
    SELECT *, COUNT(*) OVER() AS total_count
    FROM agg
    ORDER BY total_contributions DESC
    LIMIT result_limit OFFSET offset_count
  )
  SELECT
    c.org_name,
    -- Look up the best-matching committee ID from legislator_top_pacs
    (
      SELECT tp.cmte_id
      FROM public.legislator_top_pacs tp
      WHERE UPPER(TRIM(tp.cmte_name)) = UPPER(c.org_name)
         OR UPPER(TRIM(tp.connected_org)) = UPPER(c.org_name)
      GROUP BY tp.cmte_id
      ORDER BY SUM(tp.total_support) DESC
      LIMIT 1
    ) AS cmte_id,
    c.total_individual,
    c.total_pac,
    c.total_contributions,
    c.recipient_count,
    COALESCE(
      (
        SELECT jsonb_agg(r ORDER BY r->>'amount' DESC)
        FROM (
          SELECT jsonb_build_object(
            'bioguide_id', l.bioguide_id,
            'name',        l.full_name,
            'party',       l.party,
            'state',       l.state,
            'chamber',     l.chamber,
            'amount',      SUM(tc2.grand_total)
          ) AS r
          FROM public.legislator_top_contributors tc2
          JOIN public.legislators l ON l.bioguide_id = tc2.bioguide_id
          WHERE tc2.org_name = c.org_name
          GROUP BY l.bioguide_id, l.full_name, l.party, l.state, l.chamber
          ORDER BY SUM(tc2.grand_total) DESC
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
