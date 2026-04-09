-- RPC function: full PAC detail — all recipients for a given committee
CREATE OR REPLACE FUNCTION public.pac_detail(
  target_cmte_id TEXT
)
RETURNS TABLE (
  cmte_id             TEXT,
  cmte_name           TEXT,
  connected_org       TEXT,
  industry            TEXT,
  total_contributions NUMERIC,
  direct_total        NUMERIC,
  ie_for_total        NUMERIC,
  ie_against_total    NUMERIC,
  recipient_count     BIGINT,
  recipients          JSONB
)
LANGUAGE sql STABLE
AS $$
  WITH agg AS (
    SELECT
      tp.cmte_id,
      MAX(tp.cmte_name)            AS cmte_name,
      MAX(tp.connected_org)        AS connected_org,
      MAX(tp.industry)             AS industry,
      SUM(tp.total_support)        AS total_contributions,
      SUM(tp.direct_contribution)  AS direct_total,
      SUM(tp.ie_for)               AS ie_for_total,
      SUM(tp.ie_against)           AS ie_against_total,
      COUNT(DISTINCT tp.bioguide_id) AS recipient_count
    FROM public.legislator_top_pacs tp
    WHERE tp.cmte_id = target_cmte_id
    GROUP BY tp.cmte_id
  )
  SELECT
    a.cmte_id,
    a.cmte_name,
    a.connected_org,
    a.industry,
    a.total_contributions,
    a.direct_total,
    a.ie_for_total,
    a.ie_against_total,
    a.recipient_count,
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
            'amount',      SUM(tp2.total_support),
            'direct',      SUM(tp2.direct_contribution),
            'ie_for',      SUM(tp2.ie_for)
          ) AS r
          FROM public.legislator_top_pacs tp2
          JOIN public.legislators l ON l.bioguide_id = tp2.bioguide_id
          WHERE tp2.cmte_id = target_cmte_id
          GROUP BY l.bioguide_id, l.full_name, l.party, l.state, l.chamber
          ORDER BY SUM(tp2.total_support) DESC
        ) sub
      ),
      '[]'::jsonb
    ) AS recipients
  FROM agg a;
$$;

GRANT EXECUTE ON FUNCTION public.pac_detail(TEXT)
  TO anon, authenticated;
