-- Tracks pipeline script execution for observability and staleness detection.
-- Used by sync_donor_alignments.py (and extensible to other scripts).
-- Public read so the Next.js API layer can query staleness without service role.

CREATE TABLE pipeline_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script       TEXT NOT NULL,
  phase        TEXT,
  bioguide_id  TEXT REFERENCES legislators(bioguide_id) ON DELETE SET NULL,
  status       TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  result       JSONB,
  error        TEXT
);

CREATE INDEX pipeline_runs_script_started_idx
  ON pipeline_runs(script, started_at DESC);

CREATE INDEX pipeline_runs_bioguide_idx
  ON pipeline_runs(bioguide_id, started_at DESC)
  WHERE bioguide_id IS NOT NULL;

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read pipeline_runs"
  ON pipeline_runs FOR SELECT USING (true);

GRANT SELECT ON pipeline_runs TO anon, authenticated;
