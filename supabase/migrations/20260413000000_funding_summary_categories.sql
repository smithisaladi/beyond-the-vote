-- Add party, self-funded, and other funding categories to legislator_funding_summary
-- so that all percentage fields sum to ~100% of total_receipts.

ALTER TABLE legislator_funding_summary
  ADD COLUMN IF NOT EXISTS pol_pty_total     NUMERIC,
  ADD COLUMN IF NOT EXISTS pol_pty_pct       NUMERIC,
  ADD COLUMN IF NOT EXISTS self_funded_total NUMERIC,
  ADD COLUMN IF NOT EXISTS self_funded_pct   NUMERIC,
  ADD COLUMN IF NOT EXISTS other_total       NUMERIC,
  ADD COLUMN IF NOT EXISTS other_pct         NUMERIC;
