-- Rebuild search_vector to include sponsor_name, bill_number, policy_area,
-- and topics. Generated columns cannot use STABLE functions (to_tsvector,
-- array_to_string), so we switch to a BEFORE INSERT/UPDATE trigger instead.

-- Drop the existing generated column (drops its GIN index automatically)
ALTER TABLE public.bill_embeddings DROP COLUMN IF EXISTS search_vector;

-- Re-add as a plain stored column (populated by the trigger below)
ALTER TABLE public.bill_embeddings
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Trigger function: runs before every insert/update
CREATE OR REPLACE FUNCTION public.bill_embeddings_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.summary, '') || ' ' ||
    coalesce(NEW.sponsor_name, '') || ' ' ||
    coalesce(NEW.bill_number, '') || ' ' ||
    coalesce(NEW.policy_area, '') || ' ' ||
    array_to_string(coalesce(NEW.topics, '{}'), ' ')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bill_embeddings_search_vector_trigger
  ON public.bill_embeddings;

CREATE TRIGGER bill_embeddings_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.bill_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.bill_embeddings_search_vector_update();

-- Backfill all existing rows
UPDATE public.bill_embeddings
SET search_vector = to_tsvector('english',
  coalesce(title, '') || ' ' ||
  coalesce(summary, '') || ' ' ||
  coalesce(sponsor_name, '') || ' ' ||
  coalesce(bill_number, '') || ' ' ||
  coalesce(policy_area, '') || ' ' ||
  array_to_string(coalesce(topics, '{}'), ' ')
);

-- Recreate the GIN index
CREATE INDEX IF NOT EXISTS bill_embeddings_fts_idx
  ON public.bill_embeddings USING gin(search_vector);

-- Update search_bills_text to return the new columns needed by /api/bills.
-- Must DROP first because CREATE OR REPLACE cannot change the return type.
-- SECURITY DEFINER so the anon role can call it via PostgREST.
DROP FUNCTION IF EXISTS public.search_bills_text(TEXT, INT, INT);

CREATE FUNCTION public.search_bills_text(
  query_text      TEXT,
  match_count     INT DEFAULT 20,
  congress_filter INT DEFAULT NULL
)
RETURNS TABLE (
  bill_id          TEXT,
  congress         INTEGER,
  title            TEXT,
  summary          TEXT,
  bill_number      TEXT,
  status           TEXT,
  sponsor_name     TEXT,
  policy_area      TEXT,
  introduced_date  DATE,
  last_action_text TEXT,
  last_action_date DATE,
  congress_gov_url TEXT,
  topics           TEXT[],
  similarity       FLOAT
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
    be.bill_number,
    be.status,
    be.sponsor_name,
    be.policy_area,
    be.introduced_date,
    be.last_action_text,
    be.last_action_date,
    be.congress_gov_url,
    be.topics,
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
