-- Align DB schema to pipeline CLAUDE.md spec.
--
-- DROP:   vote_donor_alignments, fec_donors, donor_interest_profiles (old AI approach)
--         fec_pac_donors, fec_employer_donors, fec_candidate_totals (old pre-aggregated approach)
-- MODIFY: member_scores PK → (bioguide_id, congress); legislators fec_ids GIN index
-- ADD:    candidates, individual_contributions, pac_to_candidate, independent_expenditures,
--         legislator_funding_summary, bulk_import_checkpoints


-- ── DROP ──────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.vote_donor_alignments      CASCADE;
DROP TABLE IF EXISTS public.fec_donors                 CASCADE;
DROP TABLE IF EXISTS public.donor_interest_profiles    CASCADE;
DROP TABLE IF EXISTS public.fec_pac_donors             CASCADE;
DROP TABLE IF EXISTS public.fec_employer_donors        CASCADE;
DROP TABLE IF EXISTS public.fec_candidate_totals       CASCADE;


-- ── MODIFY ────────────────────────────────────────────────────────────────────

-- member_scores: fix PK from (bioguide_id) to (bioguide_id, congress)
-- The old single-column PK only allowed one score per legislator, making multi-congress
-- history impossible.
ALTER TABLE public.member_scores DROP CONSTRAINT member_scores_pkey;
ALTER TABLE public.member_scores ADD PRIMARY KEY (bioguide_id, congress);

-- legislators: GIN index on fec_ids[] so ANY() joins are fast
-- CLAUDE.md: "fec_ids is an array on legislators — use ANY() for joins, GIN index exists"
CREATE INDEX idx_legislators_fec_ids ON public.legislators USING gin(fec_ids);


-- ── ADD ───────────────────────────────────────────────────────────────────────

-- candidates: FEC candidate master (cn{yy}.zip)
-- Column names match FEC data dictionary header fields verbatim.
CREATE TABLE public.candidates (
  cand_id              TEXT        NOT NULL,
  cand_name            TEXT        NOT NULL,
  cand_pty_affiliation TEXT,
  cand_election_yr     SMALLINT,
  cand_office_st       TEXT,
  cand_office          CHAR(1),      -- H=House, S=Senate, P=President
  cand_office_district TEXT,
  cand_ici             CHAR(1),      -- I=Incumbent, C=Challenger, O=Open seat
  cand_status          CHAR(1),
  cand_pcc             TEXT,         -- principal campaign committee_id
  cycle                SMALLINT    NOT NULL,
  PRIMARY KEY (cand_id, cycle)
);

CREATE INDEX candidates_cand_cycle_idx ON public.candidates(cand_id, cycle DESC);

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read candidates"
  ON public.candidates FOR SELECT USING (true);
GRANT SELECT ON public.candidates TO anon, authenticated;


-- individual_contributions: donor → committee (indiv{yy}.zip)
-- Only contributions linked to committees of tracked legislators are loaded.
-- CRITICAL: FEC indiv file is ~4GB unzipped per cycle — import must stream line-by-line.
CREATE TABLE public.individual_contributions (
  sub_id          BIGINT        PRIMARY KEY,
  cmte_id         TEXT          NOT NULL,
  name            TEXT,
  city            TEXT,
  state           TEXT,
  zip_code        TEXT,
  employer        TEXT,
  occupation      TEXT,
  transaction_dt  TEXT,
  transaction_amt NUMERIC(12,2) NOT NULL,
  cycle           SMALLINT      NOT NULL
);

CREATE INDEX indiv_contrib_cmte_idx  ON public.individual_contributions(cmte_id);
CREATE INDEX indiv_contrib_cycle_state_idx ON public.individual_contributions(cycle, state);

ALTER TABLE public.individual_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read individual_contributions"
  ON public.individual_contributions FOR SELECT USING (true);
GRANT SELECT ON public.individual_contributions TO anon, authenticated;


-- pac_to_candidate: PAC direct contributions (pas2{yy}.zip, transaction_tp IN ('24K','24Z'))
CREATE TABLE public.pac_to_candidate (
  sub_id          BIGINT        PRIMARY KEY,
  cmte_id         TEXT          NOT NULL,
  cand_id         TEXT,
  transaction_tp  TEXT,
  transaction_amt NUMERIC(12,2) NOT NULL,
  transaction_dt  TEXT,
  cycle           SMALLINT      NOT NULL
);

CREATE INDEX pac_to_cand_cmte_idx  ON public.pac_to_candidate(cmte_id);
CREATE INDEX pac_to_cand_cand_idx  ON public.pac_to_candidate(cand_id);
CREATE INDEX pac_to_cand_cycle_idx ON public.pac_to_candidate(cycle);

ALTER TABLE public.pac_to_candidate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pac_to_candidate"
  ON public.pac_to_candidate FOR SELECT USING (true);
GRANT SELECT ON public.pac_to_candidate TO anon, authenticated;


-- independent_expenditures: Super PAC outside spending (pas2{yy}.zip, transaction_tp IN ('24E','24A'))
-- sup_opp: S = support candidate, O = oppose candidate
CREATE TABLE public.independent_expenditures (
  sub_id          BIGINT        PRIMARY KEY,
  cmte_id         TEXT          NOT NULL,
  cand_id         TEXT,
  sup_opp         CHAR(1)       NOT NULL CHECK (sup_opp IN ('S', 'O')),
  transaction_tp  TEXT,
  transaction_amt NUMERIC(12,2) NOT NULL,
  transaction_dt  TEXT,
  cycle           SMALLINT      NOT NULL
);

CREATE INDEX ie_cand_idx  ON public.independent_expenditures(cand_id);
CREATE INDEX ie_cycle_idx ON public.independent_expenditures(cycle);

ALTER TABLE public.independent_expenditures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read independent_expenditures"
  ON public.independent_expenditures FOR SELECT USING (true);
GRANT SELECT ON public.independent_expenditures TO anon, authenticated;


-- legislator_funding_summary: pre-computed per (bioguide_id, cycle)
-- NEVER loaded from source — always derived by compute_funding_summaries.py.
-- Re-running is safe and fully idempotent (rows are upserted/replaced each run).
CREATE TABLE public.legislator_funding_summary (
  bioguide_id         TEXT          NOT NULL,
  cycle               INT           NOT NULL,

  -- Totals
  total_receipts      NUMERIC,

  -- PAC / Corporate
  pac_direct_total    NUMERIC,
  pac_direct_pct      NUMERIC,
  superpac_ie_for     NUMERIC,
  superpac_ie_against NUMERIC,

  -- Individual donors
  large_donor_total   NUMERIC,   -- itemized contributions >= $200 (FEC disclosure line)
  large_donor_pct     NUMERIC,
  small_donor_total   NUMERIC,   -- unitemized remainder (total_receipts minus itemized)
  small_donor_pct     NUMERIC,

  -- Geographic
  in_state_total      NUMERIC,
  out_of_state_total  NUMERIC,
  out_of_state_pct    NUMERIC,
  dc_donor_total      NUMERIC,   -- DC tracked separately — disproportionately lobbyists

  -- Industry breakdown
  top_industries      JSONB,     -- [{"industry": "Finance", "total": 120000, "pct": 34.2}, ...]

  PRIMARY KEY (bioguide_id, cycle)
);

ALTER TABLE public.legislator_funding_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read legislator_funding_summary"
  ON public.legislator_funding_summary FOR SELECT USING (true);
GRANT SELECT ON public.legislator_funding_summary TO anon, authenticated;


-- bulk_import_checkpoints: chunk-level progress for large bulk imports
-- Allows bulk jobs to resume after failure without re-processing completed chunks.
CREATE TABLE public.bulk_import_checkpoints (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  script       TEXT        NOT NULL,
  source_file  TEXT        NOT NULL,
  chunk_index  BIGINT      NOT NULL,
  rows_in_chunk INT,
  status       TEXT        NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  error        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  UNIQUE (script, source_file, chunk_index)
);

ALTER TABLE public.bulk_import_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read bulk_import_checkpoints"
  ON public.bulk_import_checkpoints FOR SELECT USING (true);
GRANT SELECT ON public.bulk_import_checkpoints TO anon, authenticated;
