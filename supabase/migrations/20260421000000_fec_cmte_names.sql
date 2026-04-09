-- Lightweight committee name lookup table populated by the pipeline
-- from the local FEC committee master file (committees.csv).
-- Enables name resolution for all PACs in raw FEC tables,
-- not just those appearing in legislator_top_pacs.

CREATE TABLE IF NOT EXISTS public.fec_cmte_names (
  cmte_id       TEXT PRIMARY KEY,
  cmte_name     TEXT NOT NULL,
  connected_org TEXT
);

ALTER TABLE public.fec_cmte_names ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.fec_cmte_names FOR SELECT USING (true);
GRANT SELECT ON public.fec_cmte_names TO anon, authenticated;
