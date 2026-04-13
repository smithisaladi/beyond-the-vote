-- Drop the four remaining user-callable RPCs. Their logic now lives in
-- lib/queries/*.ts in the Next.js app, executed against Postgres via the
-- `postgres` package. Deploy the Node code before running this migration so
-- there's no window where a caller points at a function that no longer exists.
--
-- Also drops the `bill_embeddings` passthrough view, which only existed for
-- hybrid_bill_search and get_bills_by_topic to reference.

DROP FUNCTION IF EXISTS "public"."lookup_bill"("text");

DROP FUNCTION IF EXISTS "public"."get_bills_by_topic"("text", integer, "text");

DROP FUNCTION IF EXISTS "public"."hybrid_bill_search"("text", integer, integer, "text", "text", "text"[], integer);

DROP FUNCTION IF EXISTS "public"."pac_detail"("text");

DROP VIEW IF EXISTS "public"."bill_embeddings";
