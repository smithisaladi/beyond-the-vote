-- Add sponsor, date, and URL columns so bill_embeddings can serve
-- the /api/bills listing without hitting Congress.gov at runtime.

ALTER TABLE public.bill_embeddings
  ADD COLUMN IF NOT EXISTS sponsor_name        TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_bioguide_id TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_party       TEXT,
  ADD COLUMN IF NOT EXISTS introduced_date     DATE,
  ADD COLUMN IF NOT EXISTS policy_area         TEXT,
  ADD COLUMN IF NOT EXISTS congress_gov_url    TEXT,
  ADD COLUMN IF NOT EXISTS last_action_text    TEXT,
  ADD COLUMN IF NOT EXISTS last_action_date    DATE;

-- Indexes for the default sort and common filters
CREATE INDEX IF NOT EXISTS bill_embeddings_introduced_date_idx
  ON public.bill_embeddings (introduced_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS bill_embeddings_policy_area_idx
  ON public.bill_embeddings (policy_area);

CREATE INDEX IF NOT EXISTS bill_embeddings_status_idx
  ON public.bill_embeddings (status);
