-- Add entity extraction columns for agencies, laws, and U.S. Code citations
-- These are populated by scripts/backfill-entities.ts and scripts/sync-bills.ts

ALTER TABLE public.bill_embeddings
  ADD COLUMN IF NOT EXISTS referenced_agencies TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS referenced_laws     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS referenced_usc      TEXT[] DEFAULT '{}';

-- GIN indexes for fast containment queries (WHERE referenced_agencies @> ARRAY['EPA'])
CREATE INDEX IF NOT EXISTS idx_bill_embeddings_agencies
  ON public.bill_embeddings USING GIN (referenced_agencies);

CREATE INDEX IF NOT EXISTS idx_bill_embeddings_laws
  ON public.bill_embeddings USING GIN (referenced_laws);

-- Update the search_vector trigger to include agency names with weighted ranking:
-- title (A) > summary (B) > sponsor/area/agencies (C) > bill_number (D)
CREATE OR REPLACE FUNCTION public.bill_embeddings_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(NEW.sponsor_name, '') || ' ' ||
      coalesce(NEW.policy_area, '') || ' ' ||
      coalesce(array_to_string(NEW.topics, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.referenced_agencies, ' '), '')
    ), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.bill_number, '')), 'D');
  RETURN NEW;
END;
$$;

-- Backfill existing rows with new weighted search_vector
UPDATE public.bill_embeddings
SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('english',
    coalesce(sponsor_name, '') || ' ' ||
    coalesce(policy_area, '') || ' ' ||
    coalesce(array_to_string(topics, ' '), '') || ' ' ||
    coalesce(array_to_string(referenced_agencies, ' '), '')
  ), 'C') ||
  setweight(to_tsvector('english', coalesce(bill_number, '')), 'D');
