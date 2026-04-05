-- ─── pgvector extension ───────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── bill_embeddings table ────────────────────────────────────────────────────

CREATE TABLE public.bill_embeddings (
  bill_id       TEXT PRIMARY KEY,
  congress      INTEGER NOT NULL,
  title         TEXT NOT NULL,
  summary       TEXT,
  combined_text TEXT NOT NULL,
  embedding     vector(1536),
  embedded_at   TIMESTAMPTZ,
  synced_at     TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast approximate cosine similarity search
CREATE INDEX bill_embeddings_embedding_idx
  ON public.bill_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for filtering by congress
CREATE INDEX bill_embeddings_congress_idx
  ON public.bill_embeddings (congress);

-- ─── search_bills RPC ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_bills(
  query_embedding vector(1536),
  match_count     INT     DEFAULT 20,
  match_threshold FLOAT   DEFAULT 0.3
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
  SELECT
    be.bill_id,
    be.congress,
    be.title,
    be.summary,
    1 - (be.embedding <=> query_embedding) AS similarity
  FROM public.bill_embeddings be
  WHERE be.embedding IS NOT NULL
    AND 1 - (be.embedding <=> query_embedding) >= match_threshold
  ORDER BY be.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── get_unembedded_bills RPC ─────────────────────────────────────────────────
-- Returns bills from bill_vote_summaries that don't yet have an embedding.
-- bill_vote_summaries stores bill_id in the same format: {congress}-{type}-{number}.

CREATE OR REPLACE FUNCTION public.get_unembedded_bills()
RETURNS TABLE (
  bill_id  TEXT,
  congress INTEGER,
  title    TEXT,
  summary  TEXT
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (bvs.bill_id)
    bvs.bill_id,
    bvs.congress,
    NULL::TEXT AS title,
    NULL::TEXT AS summary
  FROM public.bill_vote_summaries bvs
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bill_embeddings be
    WHERE be.bill_id = bvs.bill_id
  )
  LIMIT 200;
$$;
