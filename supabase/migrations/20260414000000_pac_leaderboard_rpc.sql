-- Indexes for PAC leaderboard aggregation queries
CREATE INDEX IF NOT EXISTS idx_top_pacs_cmte_id
  ON public.legislator_top_pacs(cmte_id);

CREATE INDEX IF NOT EXISTS idx_top_pacs_industry
  ON public.legislator_top_pacs(industry);

-- RPC function: aggregated PAC leaderboard with search, filter, pagination
CREATE OR REPLACE FUNCTION public.pac_leaderboard(
  search_text  TEXT    DEFAULT NULL,
  industry_filter TEXT DEFAULT NULL,
  result_limit INT    DEFAULT 20,
  offset_count INT    DEFAULT 0
)
RETURNS TABLE (
  cmte_id             TEXT,
  cmte_name           TEXT,
  industry            TEXT,
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
  agg AS (
    SELECT
      tp.cmte_id,
      MAX(tp.cmte_name)       AS cmte_name,
      MAX(tp.industry)        AS industry,
      SUM(tp.total_support)   AS total_contributions,
      COUNT(DISTINCT tp.bioguide_id) AS recipient_count
    FROM public.legislator_top_pacs tp
    WHERE UPPER(TRIM(tp.cmte_name)) NOT IN (SELECT name FROM skip_names)
      AND (search_text IS NULL OR tp.cmte_name ILIKE '%' || search_text || '%')
      AND (industry_filter IS NULL OR tp.industry = industry_filter)
    GROUP BY tp.cmte_id
  ),
  counted AS (
    SELECT *, COUNT(*) OVER() AS total_count
    FROM agg
    ORDER BY total_contributions DESC
    LIMIT result_limit OFFSET offset_count
  )
  SELECT
    c.cmte_id,
    c.cmte_name,
    c.industry,
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
            'amount',      SUM(tp2.total_support)
          ) AS r
          FROM public.legislator_top_pacs tp2
          JOIN public.legislators l ON l.bioguide_id = tp2.bioguide_id
          WHERE tp2.cmte_id = c.cmte_id
          GROUP BY l.bioguide_id, l.full_name, l.party, l.state, l.chamber
          ORDER BY SUM(tp2.total_support) DESC
          LIMIT 5
        ) sub
      ),
      '[]'::jsonb
    ) AS top_recipients,
    c.total_count
  FROM counted c;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.pac_leaderboard(TEXT, TEXT, INT, INT)
  TO anon, authenticated;
