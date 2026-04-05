-- Step 2.1: Drop unused vector infrastructure, replace search RPC with hybrid FTS+trigram

-- Drop the vector similarity RPC (not used by the frontend)
DROP FUNCTION IF EXISTS public.search_bills(vector, int, float);

-- Drop HNSW index and embedding columns (eliminating OpenAI dependency)
DROP INDEX IF EXISTS public.bill_embeddings_embedding_idx;
ALTER TABLE public.bill_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.bill_embeddings DROP COLUMN IF EXISTS embedded_at;

-- Drop the old text search RPC
DROP FUNCTION IF EXISTS public.search_bills_text(TEXT, INT, INT);

-- ─── hybrid_bill_search ────────────────────────────────────────────────────────
--
-- DESIGN: Reciprocal Rank Fusion (RRF) over two retrieval signals.
--
-- SIGNALS
--   fts   Full-text search on the weighted tsvector (title=A, summary=B,
--         sponsors/agencies/topics=C, bill_number=D).  Scored with ts_rank_cd
--         ("cover density"), which rewards queries where matching terms appear
--         close together — analogous to BM25 proximity scoring. Returns up to 40
--         candidates.
--   trgm  pg_trgm character-trigram similarity on the raw title string.  Catches
--         typos, abbreviations, and partial-word matches that tsvector misses
--         (e.g. "helthcare" → "Healthcare"). Returns up to 20 candidates.
--
-- RRF FORMULA
--   score = Σ  weight_i / (k + rank_i)
--   where k = 60  (standard RRF constant — dampens the advantage of rank-1 over
--   rank-2; empirically optimal for most corpora).  A missing signal contributes
--   rank = 999 (≈ 0 weight), so the function degrades gracefully when only one
--   signal fires.
--
-- SIGNAL WEIGHTS
--   FTS:    1.0 / (60 + rank)  — primary signal; rewards semantic relevance
--   Trigram: 0.5 / (60 + rank) — secondary signal; acts as a tiebreaker for
--   near-miss queries.  Weighted at 0.5× because trigram similarity on bill titles
--   is noisier than FTS across a 2000-bill corpus.
--
-- WHY NO VECTOR SEARCH
--   OpenAI text-embedding-3-small was removed (see migration 20260405000004).
--   The combined FTS+trigram approach already handles the two main failure modes
--   of pure FTS: typos (trigram) and multi-word queries where term proximity
--   matters (ts_rank_cd).  Embeddings would add latency, cost, and an external
--   API dependency at sync time for marginal recall improvement on a corpus this
--   size (~2000 bills with clean CRS summaries).
--
-- FILTERS
--   Applied inside each CTE so the query planner can push predicates into the
--   GIN/B-tree indexes before ranking — avoids a full-table scan.
-- ────────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.hybrid_bill_search(
  query_text      TEXT,
  result_limit    INT     DEFAULT 20,
  offset_count    INT     DEFAULT 0,
  status_filter   TEXT    DEFAULT NULL,
  topic_filter    TEXT    DEFAULT NULL,
  policy_areas    TEXT[]  DEFAULT NULL,
  congress_filter INT     DEFAULT NULL
)
RETURNS TABLE (
  bill_id             TEXT,
  congress            INT,
  title               TEXT,
  bill_number         TEXT,
  status              TEXT,
  summary             TEXT,
  sponsor_name        TEXT,
  sponsor_bioguide_id TEXT,
  sponsor_party       TEXT,
  introduced_date     DATE,
  policy_area         TEXT,
  congress_gov_url    TEXT,
  last_action_text    TEXT,
  last_action_date    DATE,
  topics              TEXT[],
  rrf_score           FLOAT
) LANGUAGE plpgsql AS $$
DECLARE
  tsq tsquery;
BEGIN
  tsq := websearch_to_tsquery('english', query_text);

  RETURN QUERY
  WITH fts AS (
    SELECT be.bill_id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(be.search_vector, tsq) DESC
           ) AS rank
    FROM public.bill_embeddings be
    WHERE be.search_vector @@ tsq
      AND (status_filter   IS NULL OR be.status      = status_filter)
      AND (topic_filter    IS NULL OR be.topics      @> ARRAY[topic_filter])
      AND (policy_areas    IS NULL OR be.policy_area = ANY(policy_areas))
      AND (congress_filter IS NULL OR be.congress    = congress_filter)
    LIMIT 40
  ),
  trgm AS (
    SELECT be.bill_id,
           ROW_NUMBER() OVER (
             ORDER BY similarity(be.title, query_text) DESC
           ) AS rank
    FROM public.bill_embeddings be
    WHERE similarity(be.title, query_text) > 0.1
      AND (status_filter   IS NULL OR be.status      = status_filter)
      AND (topic_filter    IS NULL OR be.topics      @> ARRAY[topic_filter])
      AND (policy_areas    IS NULL OR be.policy_area = ANY(policy_areas))
      AND (congress_filter IS NULL OR be.congress    = congress_filter)
    LIMIT 20
  ),
  fused AS (
    SELECT
      COALESCE(f.bill_id, t.bill_id) AS bill_id,
      (1.0 / (60.0 + COALESCE(f.rank, 999)::FLOAT))
      + (0.5 / (60.0 + COALESCE(t.rank, 999)::FLOAT)) AS rrf_score
    FROM fts f
    FULL OUTER JOIN trgm t USING (bill_id)
  )
  SELECT
    be.bill_id,
    be.congress,
    be.title,
    be.bill_number,
    be.status,
    LEFT(be.summary, 400),
    be.sponsor_name,
    be.sponsor_bioguide_id,
    be.sponsor_party,
    be.introduced_date,
    be.policy_area,
    be.congress_gov_url,
    be.last_action_text,
    be.last_action_date,
    be.topics,
    fu.rrf_score
  FROM fused fu
  JOIN public.bill_embeddings be ON be.bill_id = fu.bill_id
  ORDER BY fu.rrf_score DESC
  LIMIT result_limit OFFSET offset_count;
END;
$$;

-- Thin RPC for exact bill_id / bill_number lookup (used as a search shortcut)
CREATE FUNCTION public.lookup_bill(query_text TEXT)
RETURNS SETOF public.bill_embeddings LANGUAGE sql STABLE AS $$
  SELECT * FROM public.bill_embeddings
  WHERE  bill_id     = lower(trim(query_text))
     OR  upper(bill_number) = upper(trim(query_text))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.hybrid_bill_search TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_bill         TO anon, authenticated;
