-- Some FEC candidate records have no cand_name (incomplete registrations).
-- The NOT NULL constraint is too strict for raw FEC bulk data.
ALTER TABLE public.candidates ALTER COLUMN cand_name DROP NOT NULL;
