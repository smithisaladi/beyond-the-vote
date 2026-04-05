-- Add topics, status, and bill_number columns to bill_embeddings
-- topics: array of topic slugs (e.g. 'climate-environment', 'healthcare')
--         classified at sync time via policyArea mapping + keyword matching
-- status: simplified status derived from latestAction text (Active/Committee/Stalled/Passed/Failed)
-- bill_number: formatted display string (e.g. 'H.R. 1234', 'S. 567')

ALTER TABLE public.bill_embeddings
  ADD COLUMN IF NOT EXISTS topics      TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status      TEXT,
  ADD COLUMN IF NOT EXISTS bill_number TEXT;

-- GIN index for fast containment queries:
--   WHERE topics @> ARRAY['climate-environment']
CREATE INDEX IF NOT EXISTS bill_embeddings_topics_idx
  ON public.bill_embeddings USING GIN (topics);

-- RPC used by GET /api/bills/by-topic
CREATE OR REPLACE FUNCTION public.get_bills_by_topic(
  topic_slug    TEXT,
  match_count   INT  DEFAULT 20,
  status_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  bill_id     TEXT,
  congress    INT,
  title       TEXT,
  summary     TEXT,
  bill_number TEXT,
  status      TEXT,
  topics      TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT bill_id, congress, title, summary, bill_number, status, topics
  FROM public.bill_embeddings
  WHERE topics @> ARRAY[topic_slug]
    AND (status_filter IS NULL OR status = status_filter)
  ORDER BY synced_at DESC
  LIMIT match_count;
$$;
