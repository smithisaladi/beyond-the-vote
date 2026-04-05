-- Add descriptive title column to bill_vote_summaries.
-- Populated at sync time as "{bill_number}: {bill_title} — {question}".
ALTER TABLE public.bill_vote_summaries
  ADD COLUMN IF NOT EXISTS title TEXT;
