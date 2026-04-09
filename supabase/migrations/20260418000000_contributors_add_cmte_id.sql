-- Add cmte_id column to legislator_top_contributors so the pipeline can store
-- the best-matching PAC committee ID directly (computed during DuckDB aggregation).
-- This replaces the unreliable name-matching subquery in the leaderboard RPC.

ALTER TABLE public.legislator_top_contributors
  ADD COLUMN IF NOT EXISTS cmte_id TEXT;

-- Update the contributor_leaderboard RPC to read cmte_id from the table
-- instead of reverse-looking it up from legislator_top_pacs.
-- Must DROP first because the return type changed (added cmte_id column).

DROP FUNCTION IF EXISTS public.contributor_leaderboard(TEXT, INT, INT);

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
      -- Pick the cmte_id from the row with the highest pac_total for this org
      (ARRAY_AGG(tc.cmte_id ORDER BY tc.pac_total DESC NULLS LAST)
        FILTER (WHERE tc.cmte_id IS NOT NULL))[1] AS cmte_id,
      SUM(tc.individual_total)  AS total_individual,
      SUM(tc.pac_total)         AS total_pac,
      SUM(tc.grand_total)       AS total_contributions,
      COUNT(DISTINCT tc.bioguide_id) AS recipient_count
    FROM public.legislator_top_contributors tc
    WHERE (search_text IS NULL OR tc.org_name ILIKE '%' || search_text || '%')
      AND tc.org_name IS NOT NULL
      AND tc.org_name != ''
      AND tc.org_name != 'None'
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
    c.cmte_id,
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
