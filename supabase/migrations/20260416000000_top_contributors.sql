-- Top Contributors table: combines individual employee donations + PAC contributions
-- by organization, matching the OpenSecrets "Top Contributors" format.
-- Derived by compute_funding_summaries.py via DuckDB — never loaded from source.

CREATE TABLE IF NOT EXISTS public.legislator_top_contributors (
    bioguide_id      TEXT    NOT NULL,
    cycle            INT     NOT NULL,
    org_name         TEXT    NOT NULL,
    individual_total NUMERIC DEFAULT 0,
    pac_total        NUMERIC DEFAULT 0,
    grand_total      NUMERIC DEFAULT 0,
    rank             INTEGER,
    PRIMARY KEY (bioguide_id, cycle, org_name)
);

CREATE INDEX idx_top_contributors_bioguide_cycle
    ON public.legislator_top_contributors(bioguide_id, cycle);

ALTER TABLE public.legislator_top_contributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read legislator_top_contributors"
    ON public.legislator_top_contributors FOR SELECT USING (true);

GRANT SELECT ON public.legislator_top_contributors TO anon, authenticated;
