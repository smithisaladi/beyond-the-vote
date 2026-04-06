ALTER TABLE public.legislators
  ADD COLUMN IF NOT EXISTS fec_committee_id TEXT;
