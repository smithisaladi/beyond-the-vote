-- FEC bulk data tables: committee master + PAC-to-candidate contributions
-- Source: https://www.fec.gov/data/browse-data/?tab=bulk-data (2025-2026 cycle)

-- ── fec_committees (from cm.txt) ─────────────────────────────────────────────
CREATE TABLE public.fec_committees (
  cmte_id              TEXT PRIMARY KEY,
  cmte_nm              TEXT NOT NULL,
  cmte_dsgn            CHAR(1),
  cmte_tp              TEXT,
  cmte_pty_affiliation TEXT,
  cmte_filing_freq     TEXT,
  org_tp               TEXT,
  connected_org_nm     TEXT,
  cand_id              TEXT
);

CREATE INDEX fec_committees_cand_idx ON public.fec_committees(cand_id);
CREATE INDEX fec_committees_org_nm_idx
  ON public.fec_committees
  USING gin(to_tsvector('simple', coalesce(connected_org_nm, '')));

ALTER TABLE public.fec_committees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read fec_committees"
  ON public.fec_committees FOR SELECT USING (true);

-- ── fec_pac_contributions (from itpas2.txt, filtered to our legislators) ─────
CREATE TABLE public.fec_pac_contributions (
  sub_id          BIGINT PRIMARY KEY,
  cmte_id         TEXT NOT NULL,
  cand_id         TEXT,
  other_id        TEXT,
  name            TEXT,
  transaction_tp  TEXT,
  transaction_amt NUMERIC(12,2),
  transaction_dt  TEXT,
  amndt_ind       CHAR(1),
  employer        TEXT,
  occupation      TEXT,
  entity_tp       TEXT
);

CREATE INDEX fec_pac_contrib_cmte_idx  ON public.fec_pac_contributions(cmte_id);
CREATE INDEX fec_pac_contrib_cand_idx  ON public.fec_pac_contributions(cand_id);
CREATE INDEX fec_pac_contrib_other_idx ON public.fec_pac_contributions(other_id);

ALTER TABLE public.fec_pac_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read fec_pac_contributions"
  ON public.fec_pac_contributions FOR SELECT USING (true);
