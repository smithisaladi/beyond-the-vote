-- Add per-user "last seen activity" timestamp to support highlighting unread
-- items in the Dashboard activity feed. Existing RLS policies on public.profiles
-- ("users can view own profile", "users can update own profile") already cover
-- reads and writes to this column.

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "activity_last_seen_at" timestamp with time zone;
