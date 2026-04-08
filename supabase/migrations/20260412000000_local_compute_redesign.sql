-- Migration: Local compute redesign
--
-- 1. Create legislator_top_pacs table (derived by compute_funding_summaries.py)
-- 2. Drop FEC source tables that are now processed locally via DuckDB:
--    - individual_contributions (too large for Supabase, aggregated locally)
--    - candidates (only needed for FEC ID resolution, done locally)
--    - fec_committees (only needed for industry classification, done locally)
-- 3. Clean up associated checkpoint records

-- ── 1. legislator_top_pacs ──────────────────────────────────────────────────

CREATE TABLE public.legislator_top_pacs (
    bioguide_id         TEXT     NOT NULL,
    cycle               INT      NOT NULL,
    cmte_id             TEXT     NOT NULL,
    cmte_name           TEXT,
    connected_org       TEXT,
    industry            TEXT,
    direct_contribution NUMERIC,
    ie_for              NUMERIC,
    ie_against          NUMERIC,
    total_support       NUMERIC,
    rank                INTEGER,
    PRIMARY KEY (bioguide_id, cycle, cmte_id)
);

CREATE INDEX idx_top_pacs_bioguide_cycle
    ON public.legislator_top_pacs(bioguide_id, cycle);

ALTER TABLE public.legislator_top_pacs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read legislator_top_pacs"
    ON public.legislator_top_pacs FOR SELECT USING (true);

GRANT SELECT ON public.legislator_top_pacs TO anon, authenticated;

-- ── 2. Drop tables now processed locally ────────────────────────────────────

DROP TABLE IF EXISTS public.individual_contributions;
DROP TABLE IF EXISTS public.candidates;
DROP TABLE IF EXISTS public.fec_committees;

-- ── 3. Clean up checkpoint records for dropped tables ───────────────────────

DELETE FROM public.bulk_import_checkpoints
WHERE script = 'bulk_import_fec'
  AND (
    source_file LIKE 'candidates_%'
    OR source_file LIKE 'committees_%'
    OR source_file LIKE 'indiv_%'
  );
