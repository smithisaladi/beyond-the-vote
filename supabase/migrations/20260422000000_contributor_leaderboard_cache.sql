-- Pre-computed contributor leaderboard table.
-- Populated by pipeline/scripts/compute/compute_leaderboard_cache.py after FEC sync.
-- The API queries this table directly instead of calling the expensive RPC.

CREATE TABLE IF NOT EXISTS public.contributor_leaderboard_cache (
  cmte_id              TEXT PRIMARY KEY,
  cmte_name            TEXT NOT NULL DEFAULT '',
  direct_total         NUMERIC NOT NULL DEFAULT 0,
  ie_for_total         NUMERIC NOT NULL DEFAULT 0,
  ie_against_total     NUMERIC NOT NULL DEFAULT 0,
  total_contributions  NUMERIC NOT NULL DEFAULT 0,
  recipient_count      BIGINT NOT NULL DEFAULT 0,
  top_recipients       JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigram index for fast case-insensitive name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_name_trgm
  ON public.contributor_leaderboard_cache USING gin (cmte_name gin_trgm_ops);

-- Ordering index
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_total
  ON public.contributor_leaderboard_cache (total_contributions DESC);

ALTER TABLE public.contributor_leaderboard_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read" ON public.contributor_leaderboard_cache
  FOR SELECT USING (true);
