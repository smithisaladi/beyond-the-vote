-- Drop unused Supabase objects.
--
-- `profiles` was populated by the `handle_new_user` trigger on auth.users but
-- was never read or written elsewhere — remove table + trigger + function.
--
-- The three RPCs below are vestigial: `pac_leaderboard` and
-- `contributor_leaderboard` were superseded by the pre-computed
-- `contributor_leaderboard_cache` table that the frontend reads directly, and
-- `get_unembedded_bills` has no callers in either the frontend or the pipeline.
--
-- `bill_embeddings` (a passthrough view over `bills`) is dropped in the
-- follow-up migration together with the remaining RPCs that still reference
-- it — dropping the view here would break hybrid_bill_search / get_bills_by_topic.

DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";

DROP FUNCTION IF EXISTS "public"."handle_new_user"();

DROP TABLE IF EXISTS "public"."profiles";

DROP FUNCTION IF EXISTS "public"."get_unembedded_bills"();

DROP FUNCTION IF EXISTS "public"."pac_leaderboard"("text", "text", integer, integer);

DROP FUNCTION IF EXISTS "public"."contributor_leaderboard"("text", integer, integer);
