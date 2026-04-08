-- Replace raw fec_pac_contributions with three pre-aggregated donor tables.
--
-- OLD (dead): fec_pac_contributions — raw transaction rows, never queried by app
-- NEW:
--   fec_pac_donors        — PAC contributions aggregated by (cand_id, cmte_id, cycle)
--   fec_employer_donors   — individual contributions aggregated by (cand_id, employer, cycle)
--   fec_candidate_totals  — per-cycle financial summary from weball.txt
--
-- Source files (fec_data/{cycle}/ directory):
--   itpas2.txt → fec_pac_donors
--   itcont.txt → fec_employer_donors  (warning: 4-6 GB uncompressed)
--   weball.txt → fec_candidate_totals
--   cm.txt     → fec_committees (unchanged, used as lookup during import)

DROP TABLE IF EXISTS public.fec_pac_contributions;

-- ── fec_pac_donors ────────────────────────────────────────────────────────────
-- PAC/committee contributions to a candidate, aggregated per cycle.
-- cmte_nm is denormalized from cm.txt at import time.
CREATE TABLE public.fec_pac_donors (
  cand_id      TEXT          NOT NULL,
  cmte_id      TEXT          NOT NULL,
  cmte_nm      TEXT,
  total_amount NUMERIC(12,2) NOT NULL,
  cycle        SMALLINT      NOT NULL,
  PRIMARY KEY (cand_id, cmte_id, cycle)
);

CREATE INDEX fec_pac_donors_cand_idx ON public.fec_pac_donors(cand_id, cycle DESC);

ALTER TABLE public.fec_pac_donors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read fec_pac_donors"
  ON public.fec_pac_donors FOR SELECT USING (true);

GRANT SELECT ON public.fec_pac_donors TO anon, authenticated;

-- ── fec_employer_donors ───────────────────────────────────────────────────────
-- Individual contributions to a candidate's committee, aggregated by employer.
-- employer is stored uppercased for stable grouping; convert to title case at display time.
CREATE TABLE public.fec_employer_donors (
  cand_id      TEXT          NOT NULL,
  employer     TEXT          NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  cycle        SMALLINT      NOT NULL,
  PRIMARY KEY (cand_id, employer, cycle)
);

CREATE INDEX fec_employer_donors_cand_idx ON public.fec_employer_donors(cand_id, cycle DESC);

ALTER TABLE public.fec_employer_donors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read fec_employer_donors"
  ON public.fec_employer_donors FOR SELECT USING (true);

GRANT SELECT ON public.fec_employer_donors TO anon, authenticated;

-- ── fec_candidate_totals ──────────────────────────────────────────────────────
-- Per-cycle financial summary from weball.txt.
-- Columns map directly to weball.txt fields; see FEC data dictionary.
CREATE TABLE public.fec_candidate_totals (
  cand_id                TEXT          NOT NULL,
  cycle                  SMALLINT      NOT NULL,
  ttl_receipts           NUMERIC(14,2),
  ttl_indiv_contrib      NUMERIC(14,2),
  other_pol_cmte_contrib NUMERIC(14,2),
  pol_pty_contrib        NUMERIC(14,2),
  cand_contrib           NUMERIC(14,2),
  PRIMARY KEY (cand_id, cycle)
);

CREATE INDEX fec_candidate_totals_cand_idx ON public.fec_candidate_totals(cand_id, cycle DESC);

ALTER TABLE public.fec_candidate_totals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read fec_candidate_totals"
  ON public.fec_candidate_totals FOR SELECT USING (true);

GRANT SELECT ON public.fec_candidate_totals TO anon, authenticated;
