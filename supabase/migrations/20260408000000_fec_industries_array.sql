-- Convert fec_industry (TEXT, single value) to fec_industries (TEXT[], multiple values).
-- "Various" (our internal fallback label) becomes an empty array — unknown, not a category.
-- Existing single-industry values are wrapped in a single-element array.

ALTER TABLE donor_interest_profiles
  RENAME COLUMN fec_industry TO fec_industries;

ALTER TABLE donor_interest_profiles
  ALTER COLUMN fec_industries TYPE TEXT[]
  USING CASE
    WHEN fec_industries IS NULL OR fec_industries = 'Various' THEN ARRAY[]::TEXT[]
    ELSE ARRAY[fec_industries]
  END;
