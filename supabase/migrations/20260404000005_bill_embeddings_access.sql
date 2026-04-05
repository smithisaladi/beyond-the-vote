-- Enable RLS and add public read policy on bill_embeddings,
-- consistent with the other read-only data tables.
ALTER TABLE public.bill_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read bill_embeddings"
  ON public.bill_embeddings
  FOR SELECT
  USING (true);

-- Re-create the search function as SECURITY DEFINER so it runs with
-- owner privileges even when called by the anon role via PostgREST.
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
LANGUAGE sql STABLE SECURITY DEFINER
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
           THEN ts_rank(be.search_vector, tsq.q, 1)
           ELSE 0.0
      END
      + similarity(be.title, query_text)
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
