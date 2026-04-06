-- Synced PAC/committee donors per legislator (avoids repeated OpenFEC calls)
CREATE TABLE fec_donors (
  bioguide_id   TEXT        NOT NULL REFERENCES legislators(bioguide_id) ON DELETE CASCADE,
  committee_name TEXT        NOT NULL,
  committee_id  TEXT,
  total_amount  INTEGER     NOT NULL,
  cycle         INTEGER,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bioguide_id, committee_name)
);

CREATE INDEX fec_donors_bioguide_idx ON fec_donors(bioguide_id);

-- LLM-generated one-sentence interest profile per PAC (generated once, reused across legislators)
CREATE TABLE donor_interest_profiles (
  committee_name  TEXT        NOT NULL PRIMARY KEY,
  interest_summary TEXT       NOT NULL,
  fec_industry    TEXT,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Precomputed vote-donor alignment analysis (primary output of sync-donor-alignments.ts)
CREATE TABLE vote_donor_alignments (
  vote_id               TEXT    NOT NULL REFERENCES bill_vote_summaries(id) ON DELETE CASCADE,
  bioguide_id           TEXT    NOT NULL REFERENCES legislators(bioguide_id) ON DELETE CASCADE,
  donor_name            TEXT    NOT NULL,
  donor_amount          INTEGER,
  donor_likely_position TEXT    CHECK (donor_likely_position IN ('support', 'oppose', 'neutral')),
  vote_aligns           BOOLEAN NOT NULL,
  explanation           TEXT    NOT NULL,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vote_id, bioguide_id, donor_name)
);

CREATE INDEX vote_donor_alignments_bioguide_idx ON vote_donor_alignments(bioguide_id);
CREATE INDEX vote_donor_alignments_vote_idx     ON vote_donor_alignments(vote_id);

-- Public read access (no auth required to view transparency data)
ALTER TABLE fec_donors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE donor_interest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_donor_alignments   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read fec_donors"              ON fec_donors              FOR SELECT USING (true);
CREATE POLICY "Public read donor_interest_profiles" ON donor_interest_profiles FOR SELECT USING (true);
CREATE POLICY "Public read vote_donor_alignments"   ON vote_donor_alignments   FOR SELECT USING (true);
