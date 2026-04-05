-- ─── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Generated tsvector column ────────────────────────────────────────────────
-- Indexes title + summary for full-text search. combined_text is intentionally
-- excluded to keep the index size small; title/summary cover what users search.

ALTER TABLE public.bill_embeddings
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(summary, '')
    )
  ) STORED;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS bill_embeddings_fts_idx
  ON public.bill_embeddings USING gin(search_vector);

-- GIN trigram index on title for fuzzy / partial-word matching
CREATE INDEX IF NOT EXISTS bill_embeddings_title_trgm_idx
  ON public.bill_embeddings USING gin(title gin_trgm_ops);

-- ─── search_bills_text RPC ────────────────────────────────────────────────────
-- Combines full-text ranking (ts_rank, normalised to ~0-1) with pg_trgm title
-- similarity (0-1) so the result set covers both exact-phrase and fuzzy matches.
-- The LEAST(1.0, ...) clamp ensures the returned similarity stays in [0, 1].

CREATE OR REPLACE FUNCTION public.search_bills_text(
  query_text      TEXT,
  match_count     INT DEFAULT 20,
  congress_filter INT DEFAULT NULL
)
RETURNS TABLE (
  bill_id    TEXT,
  congress   INTEGER,
  title      TEXT,
  summary    TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  WITH tsq AS (
    SELECT websearch_to_tsquery('english', query_text) AS q
  )
  SELECT
    be.bill_id,
    be.congress,
    be.title,
    be.summary,
    LEAST(1.0,
      CASE WHEN be.search_vector @@ tsq.q
           THEN ts_rank(be.search_vector, tsq.q, 1)   -- normalised by log(ndoc)
           ELSE 0.0
      END
      + similarity(be.title, query_text)               -- pg_trgm, already 0-1
    )::float AS similarity
  FROM public.bill_embeddings be, tsq
  WHERE
    (congress_filter IS NULL OR be.congress = congress_filter)
    AND (
      be.search_vector @@ tsq.q
      OR similarity(be.title, query_text) > 0.15
    )
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
