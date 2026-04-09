-- combined_text is no longer populated by the pipeline.
-- Full-text search uses a trigger on title/summary/sponsor/topics instead.
ALTER TABLE bills ALTER COLUMN combined_text DROP NOT NULL;