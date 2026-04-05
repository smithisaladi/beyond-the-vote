-- ─── Phase 1: Foundation Tables ─────────────────────────────────────────────

CREATE TABLE public.legislators (
  bioguide_id    TEXT PRIMARY KEY,
  lis_id         TEXT UNIQUE,
  icpsr_id       INTEGER,
  fec_ids        TEXT[],
  govtrack_id    TEXT,
  thomas_id      TEXT,

  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  party          TEXT NOT NULL,
  chamber        TEXT NOT NULL,
  state          TEXT NOT NULL,
  state_full     TEXT NOT NULL,
  district       INTEGER,
  title          TEXT NOT NULL,
  in_office      BOOLEAN DEFAULT TRUE,

  birthday       DATE,
  gender         TEXT,
  website        TEXT,
  phone          TEXT,
  address        TEXT,
  photo_url      TEXT,

  term_start     DATE,
  term_end       DATE,
  senate_class   INTEGER,
  next_election  INTEGER,

  twitter        TEXT,
  facebook       TEXT,
  youtube        TEXT,

  raw_json       JSONB,
  synced_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_legislators_lis     ON public.legislators(lis_id);
CREATE INDEX idx_legislators_icpsr   ON public.legislators(icpsr_id);
CREATE INDEX idx_legislators_state   ON public.legislators(state);
CREATE INDEX idx_legislators_chamber ON public.legislators(chamber);

-- ─── Ideology Scores ─────────────────────────────────────────────────────────

CREATE TABLE public.member_scores (
  bioguide_id    TEXT PRIMARY KEY REFERENCES public.legislators(bioguide_id) ON DELETE CASCADE,
  congress       INTEGER NOT NULL,
  chamber        TEXT NOT NULL,
  nominate_dim1  NUMERIC(6,3),
  nominate_dim2  NUMERIC(6,3),
  num_votes      INTEGER,
  geo_mean_prob  NUMERIC(6,3),
  synced_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Committees ──────────────────────────────────────────────────────────────

CREATE TABLE public.committees (
  thomas_id      TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  chamber        TEXT NOT NULL,
  url            TEXT,
  parent_id      TEXT REFERENCES public.committees(thomas_id)
);

CREATE TABLE public.committee_memberships (
  bioguide_id    TEXT REFERENCES public.legislators(bioguide_id) ON DELETE CASCADE,
  committee_id   TEXT REFERENCES public.committees(thomas_id) ON DELETE CASCADE,
  title          TEXT,
  PRIMARY KEY (bioguide_id, committee_id)
);

-- ─── Phase 2: Bill Vote Tables ────────────────────────────────────────────────

CREATE TABLE public.bill_vote_summaries (
  id               TEXT PRIMARY KEY,
  bill_id          TEXT NOT NULL,
  congress         INTEGER NOT NULL,
  chamber          TEXT NOT NULL,
  date             DATE NOT NULL,
  question         TEXT,
  result           TEXT NOT NULL,
  required         TEXT,

  yea_total        INTEGER NOT NULL DEFAULT 0,
  nay_total        INTEGER NOT NULL DEFAULT 0,
  present_total    INTEGER DEFAULT 0,
  not_voting_total INTEGER DEFAULT 0,

  yea_democrat     INTEGER,
  nay_democrat     INTEGER,
  yea_republican   INTEGER,
  nay_republican   INTEGER,
  yea_independent  INTEGER,
  nay_independent  INTEGER,

  source_url       TEXT,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bvs_bill ON public.bill_vote_summaries(bill_id);
CREATE INDEX idx_bvs_date ON public.bill_vote_summaries(date DESC);

CREATE TABLE public.bill_vote_positions (
  vote_id        TEXT NOT NULL REFERENCES public.bill_vote_summaries(id) ON DELETE CASCADE,
  bioguide_id    TEXT NOT NULL REFERENCES public.legislators(bioguide_id) ON DELETE CASCADE,
  position       TEXT NOT NULL,
  PRIMARY KEY (vote_id, bioguide_id)
);

CREATE INDEX idx_bvp_member ON public.bill_vote_positions(bioguide_id);

-- ─── Row-level security (public read, service-role write) ────────────────────

ALTER TABLE public.legislators          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_scores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_vote_summaries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_vote_positions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read legislators"           ON public.legislators           FOR SELECT USING (true);
CREATE POLICY "public read member_scores"         ON public.member_scores         FOR SELECT USING (true);
CREATE POLICY "public read committees"            ON public.committees            FOR SELECT USING (true);
CREATE POLICY "public read committee_memberships" ON public.committee_memberships FOR SELECT USING (true);
CREATE POLICY "public read bill_vote_summaries"   ON public.bill_vote_summaries   FOR SELECT USING (true);
CREATE POLICY "public read bill_vote_positions"   ON public.bill_vote_positions   FOR SELECT USING (true);
