


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE OR REPLACE FUNCTION "public"."bill_embeddings_search_vector_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(NEW.sponsor_name, '') || ' ' ||
      coalesce(NEW.policy_area, '') || ' ' ||
      coalesce(array_to_string(NEW.topics, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.referenced_agencies, ' '), '')
    ), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.bill_number, '')), 'D');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bill_embeddings_search_vector_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contributor_leaderboard"("search_text" "text" DEFAULT NULL::"text", "result_limit" integer DEFAULT 20, "offset_count" integer DEFAULT 0) RETURNS TABLE("cmte_id" "text", "cmte_name" "text", "direct_total" numeric, "ie_for_total" numeric, "ie_against_total" numeric, "total_contributions" numeric, "recipient_count" bigint, "top_recipients" "jsonb", "total_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  WITH skip_names AS (
    SELECT unnest(ARRAY[
      'ACTBLUE', 'WINRED',
      'DEMOCRATIC SENATORIAL CAMPAIGN COMMITTEE', 'DSCC',
      'DEMOCRATIC CONGRESSIONAL CAMPAIGN COMMITTEE', 'DCCC',
      'NRSC', 'NRCC',
      'NATIONAL REPUBLICAN SENATORIAL COMMITTEE',
      'NATIONAL REPUBLICAN CONGRESSIONAL COMMITTEE',
      'DEMOCRATIC NATIONAL COMMITTEE', 'DNC',
      'REPUBLICAN NATIONAL COMMITTEE', 'RNC',
      'SENATE MAJORITY PAC', 'HOUSE MAJORITY PAC',
      'SENATE LEADERSHIP FUND', 'CONGRESSIONAL LEADERSHIP FUND',
      'EMILY''S LIST', 'END CITIZENS UNITED'
    ]) AS name
  ),
  -- Collect all (cmte_id, cand_id) pairs that target a known legislator
  legislator_cands AS (
    SELECT DISTINCT unnest(l.fec_ids) AS cand_id
    FROM public.legislators l
  ),
  -- Direct PAC-to-candidate contributions scoped to known legislators
  direct AS (
    SELECT
      p.cmte_id,
      p.cand_id,
      SUM(p.transaction_amt) AS direct_amt
    FROM public.pac_to_candidate p
    WHERE p.cand_id IN (SELECT cand_id FROM legislator_cands)
    GROUP BY p.cmte_id, p.cand_id
  ),
  -- Independent expenditures scoped to known legislators
  ies AS (
    SELECT
      ie.cmte_id,
      ie.cand_id,
      SUM(CASE WHEN ie.sup_opp = 'S' THEN ie.transaction_amt ELSE 0 END) AS ie_for,
      SUM(CASE WHEN ie.sup_opp = 'O' THEN ie.transaction_amt ELSE 0 END) AS ie_against
    FROM public.independent_expenditures ie
    WHERE ie.cand_id IN (SELECT cand_id FROM legislator_cands)
    GROUP BY ie.cmte_id, ie.cand_id
  ),
  -- Combine per (cmte_id, cand_id)
  per_cmte_cand AS (
    SELECT
      COALESCE(d.cmte_id, i.cmte_id) AS cmte_id,
      COALESCE(d.cand_id, i.cand_id) AS cand_id,
      COALESCE(d.direct_amt, 0)      AS direct_amt,
      COALESCE(i.ie_for, 0)          AS ie_for,
      COALESCE(i.ie_against, 0)      AS ie_against,
      COALESCE(d.direct_amt, 0) + COALESCE(i.ie_for, 0) AS total_support
    FROM direct d
    FULL OUTER JOIN ies i ON d.cmte_id = i.cmte_id AND d.cand_id = i.cand_id
  ),
  -- Aggregate per committee
  agg AS (
    SELECT
      pc.cmte_id,
      SUM(pc.direct_amt)    AS direct_total,
      SUM(pc.ie_for)        AS ie_for_total,
      SUM(pc.ie_against)    AS ie_against_total,
      SUM(pc.total_support) AS total_contributions,
      COUNT(DISTINCT pc.cand_id) FILTER (WHERE pc.total_support > 0) AS recipient_count
    FROM per_cmte_cand pc
    GROUP BY pc.cmte_id
  ),
  -- Resolve committee name from fec_cmte_names
  named AS (
    SELECT
      a.*,
      COALESCE(cn.cmte_name, a.cmte_id) AS cmte_name
    FROM agg a
    LEFT JOIN public.fec_cmte_names cn ON a.cmte_id = cn.cmte_id
  ),
  -- Apply filters and skip pass-through entities
  filtered AS (
    SELECT *
    FROM named n
    WHERE UPPER(TRIM(n.cmte_name)) NOT IN (SELECT name FROM skip_names)
      AND (search_text IS NULL OR n.cmte_name ILIKE '%' || search_text || '%')
  ),
  counted AS (
    SELECT *, COUNT(*) OVER() AS total_count
    FROM filtered
    ORDER BY total_contributions DESC
    LIMIT result_limit OFFSET offset_count
  )
  SELECT
    c.cmte_id,
    c.cmte_name,
    c.direct_total,
    c.ie_for_total,
    c.ie_against_total,
    c.total_contributions,
    c.recipient_count,
    COALESCE(
      (
        SELECT jsonb_agg(r ORDER BY (r->>'amount')::numeric DESC)
        FROM (
          SELECT jsonb_build_object(
            'bioguide_id', l.bioguide_id,
            'name',        l.full_name,
            'party',       l.party,
            'state',       l.state,
            'chamber',     l.chamber,
            'amount',      pc2.total_support,
            'direct',      pc2.direct_amt,
            'ie_for',      pc2.ie_for
          ) AS r
          FROM per_cmte_cand pc2
          JOIN public.legislators l ON pc2.cand_id = ANY(l.fec_ids)
          WHERE pc2.cmte_id = c.cmte_id AND pc2.total_support > 0
          ORDER BY pc2.total_support DESC
          LIMIT 5
        ) sub
      ),
      '[]'::jsonb
    ) AS top_recipients,
    c.total_count
  FROM counted c;
$$;


ALTER FUNCTION "public"."contributor_leaderboard"("search_text" "text", "result_limit" integer, "offset_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_bills_by_topic"("topic_slug" "text", "match_count" integer DEFAULT 20, "status_filter" "text" DEFAULT NULL::"text") RETURNS TABLE("bill_id" "text", "congress" integer, "title" "text", "summary" "text", "bill_number" "text", "status" "text", "topics" "text"[])
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT bill_id, congress, title, summary, bill_number, status, topics
  FROM public.bill_embeddings
  WHERE topics @> ARRAY[topic_slug]
    AND (status_filter IS NULL OR status = status_filter)
  ORDER BY synced_at DESC
  LIMIT match_count;
$$;


ALTER FUNCTION "public"."get_bills_by_topic"("topic_slug" "text", "match_count" integer, "status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unembedded_bills"() RETURNS TABLE("bill_id" "text", "congress" integer, "title" "text", "summary" "text")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT DISTINCT ON (bvs.bill_id)
    bvs.bill_id,
    bvs.congress,
    NULL::TEXT AS title,
    NULL::TEXT AS summary
  FROM public.bill_vote_summaries bvs
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bill_embeddings be
    WHERE be.bill_id = bvs.bill_id
  )
  LIMIT 200;
$$;


ALTER FUNCTION "public"."get_unembedded_bills"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hybrid_bill_search"("query_text" "text", "result_limit" integer DEFAULT 20, "offset_count" integer DEFAULT 0, "status_filter" "text" DEFAULT NULL::"text", "topic_filter" "text" DEFAULT NULL::"text", "policy_areas" "text"[] DEFAULT NULL::"text"[], "congress_filter" integer DEFAULT NULL::integer) RETURNS TABLE("bill_id" "text", "congress" integer, "title" "text", "bill_number" "text", "status" "text", "summary" "text", "sponsor_name" "text", "sponsor_bioguide_id" "text", "sponsor_party" "text", "introduced_date" "date", "policy_area" "text", "congress_gov_url" "text", "last_action_text" "text", "last_action_date" "date", "topics" "text"[], "rrf_score" double precision)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  tsq tsquery;
BEGIN
  tsq := websearch_to_tsquery('english', query_text);

  RETURN QUERY
  WITH fts AS (
    SELECT be.bill_id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(be.search_vector, tsq) DESC
           ) AS rank
    FROM public.bill_embeddings be
    WHERE be.search_vector @@ tsq
      AND (status_filter   IS NULL OR be.status      = status_filter)
      AND (topic_filter    IS NULL OR be.topics      @> ARRAY[topic_filter])
      AND (policy_areas    IS NULL OR be.policy_area = ANY(policy_areas))
      AND (congress_filter IS NULL OR be.congress    = congress_filter)
    LIMIT 40
  ),
  trgm AS (
    SELECT be.bill_id,
           ROW_NUMBER() OVER (
             ORDER BY similarity(be.title, query_text) DESC
           ) AS rank
    FROM public.bill_embeddings be
    WHERE similarity(be.title, query_text) > 0.1
      AND (status_filter   IS NULL OR be.status      = status_filter)
      AND (topic_filter    IS NULL OR be.topics      @> ARRAY[topic_filter])
      AND (policy_areas    IS NULL OR be.policy_area = ANY(policy_areas))
      AND (congress_filter IS NULL OR be.congress    = congress_filter)
    LIMIT 20
  ),
  fused AS (
    SELECT
      COALESCE(f.bill_id, t.bill_id) AS bill_id,
      (1.0 / (60.0 + COALESCE(f.rank, 999)::FLOAT))
      + (0.5 / (60.0 + COALESCE(t.rank, 999)::FLOAT)) AS rrf_score
    FROM fts f
    FULL OUTER JOIN trgm t USING (bill_id)
  )
  SELECT
    be.bill_id,
    be.congress,
    be.title,
    be.bill_number,
    be.status,
    LEFT(be.summary, 400),
    be.sponsor_name,
    be.sponsor_bioguide_id,
    be.sponsor_party,
    be.introduced_date,
    be.policy_area,
    be.congress_gov_url,
    be.last_action_text,
    be.last_action_date,
    be.topics,
    fu.rrf_score
  FROM fused fu
  JOIN public.bill_embeddings be ON be.bill_id = fu.bill_id
  ORDER BY fu.rrf_score DESC
  LIMIT result_limit OFFSET offset_count;
END;
$$;


ALTER FUNCTION "public"."hybrid_bill_search"("query_text" "text", "result_limit" integer, "offset_count" integer, "status_filter" "text", "topic_filter" "text", "policy_areas" "text"[], "congress_filter" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bills" (
    "bill_id" "text" NOT NULL,
    "congress" integer NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "combined_text" "text",
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "topics" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text",
    "bill_number" "text",
    "sponsor_name" "text",
    "sponsor_bioguide_id" "text",
    "sponsor_party" "text",
    "introduced_date" "date",
    "policy_area" "text",
    "congress_gov_url" "text",
    "last_action_text" "text",
    "last_action_date" "date",
    "search_vector" "tsvector",
    "referenced_agencies" "text"[] DEFAULT '{}'::"text"[],
    "referenced_laws" "text"[] DEFAULT '{}'::"text"[],
    "referenced_usc" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."bills" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_bill"("query_text" "text") RETURNS SETOF "public"."bills"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT * FROM public.bills
  WHERE  bill_id     = lower(trim(query_text))
     OR  upper(bill_number) = upper(trim(query_text))
  LIMIT 1;
$$;


ALTER FUNCTION "public"."lookup_bill"("query_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pac_detail"("target_cmte_id" "text") RETURNS TABLE("cmte_id" "text", "cmte_name" "text", "connected_org" "text", "total_contributions" numeric, "direct_total" numeric, "ie_for_total" numeric, "ie_against_total" numeric, "recipient_count" bigint, "recipients" "jsonb")
    LANGUAGE "sql" STABLE
    AS $$
  -- Get committee name/org — aggregate ensures exactly one row even if not found
  WITH cmte_info AS (
    SELECT
      MAX(cn.cmte_name)    AS cmte_name,
      MAX(cn.connected_org) AS connected_org
    FROM public.fec_cmte_names cn
    WHERE cn.cmte_id = target_cmte_id
  ),
  -- Direct PAC-to-candidate contributions
  direct AS (
    SELECT
      p.cand_id,
      SUM(p.transaction_amt) AS direct_amt
    FROM public.pac_to_candidate p
    WHERE p.cmte_id = target_cmte_id
    GROUP BY p.cand_id
  ),
  -- Independent expenditures
  ies AS (
    SELECT
      ie.cand_id,
      SUM(CASE WHEN ie.sup_opp = 'S' THEN ie.transaction_amt ELSE 0 END) AS ie_for,
      SUM(CASE WHEN ie.sup_opp = 'O' THEN ie.transaction_amt ELSE 0 END) AS ie_against
    FROM public.independent_expenditures ie
    WHERE ie.cmte_id = target_cmte_id
    GROUP BY ie.cand_id
  ),
  -- Combine direct + IE per candidate
  per_candidate AS (
    SELECT
      COALESCE(d.cand_id, i.cand_id) AS cand_id,
      COALESCE(d.direct_amt, 0)      AS direct_amt,
      COALESCE(i.ie_for, 0)          AS ie_for,
      COALESCE(i.ie_against, 0)      AS ie_against,
      COALESCE(d.direct_amt, 0) + COALESCE(i.ie_for, 0) AS total_support
    FROM direct d
    FULL OUTER JOIN ies i ON d.cand_id = i.cand_id
  ),
  -- Grand totals across ALL candidates
  totals AS (
    SELECT
      SUM(direct_amt)    AS direct_total,
      SUM(ie_for)        AS ie_for_total,
      SUM(ie_against)    AS ie_against_total,
      SUM(total_support) AS total_contributions,
      COUNT(DISTINCT cand_id) FILTER (WHERE total_support > 0) AS recipient_count
    FROM per_candidate
  )
  SELECT
    target_cmte_id AS cmte_id,
    ci.cmte_name,
    ci.connected_org,
    t.total_contributions,
    t.direct_total,
    t.ie_for_total,
    t.ie_against_total,
    t.recipient_count,
    COALESCE(
      (
        SELECT jsonb_agg(r ORDER BY (r->>'amount')::numeric DESC)
        FROM (
          SELECT jsonb_build_object(
            'bioguide_id', l.bioguide_id,
            'name',        l.full_name,
            'party',       l.party,
            'state',       l.state,
            'chamber',     l.chamber,
            'amount',      pc.total_support,
            'direct',      pc.direct_amt,
            'ie_for',      pc.ie_for
          ) AS r
          FROM per_candidate pc
          JOIN public.legislators l
            ON pc.cand_id = ANY(l.fec_ids)
          WHERE pc.total_support > 0
          ORDER BY pc.total_support DESC
          LIMIT 20
        ) sub
      ),
      '[]'::jsonb
    ) AS recipients
  FROM totals t
  CROSS JOIN cmte_info ci;
$$;


ALTER FUNCTION "public"."pac_detail"("target_cmte_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pac_leaderboard"("search_text" "text" DEFAULT NULL::"text", "industry_filter" "text" DEFAULT NULL::"text", "result_limit" integer DEFAULT 20, "offset_count" integer DEFAULT 0) RETURNS TABLE("cmte_id" "text", "cmte_name" "text", "industry" "text", "total_contributions" numeric, "recipient_count" bigint, "top_recipients" "jsonb", "total_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  WITH skip_names AS (
    SELECT unnest(ARRAY[
      'ACTBLUE', 'WINRED',
      'DEMOCRATIC SENATORIAL CAMPAIGN COMMITTEE', 'DSCC',
      'DEMOCRATIC CONGRESSIONAL CAMPAIGN COMMITTEE', 'DCCC',
      'NRSC', 'NRCC',
      'NATIONAL REPUBLICAN SENATORIAL COMMITTEE',
      'NATIONAL REPUBLICAN CONGRESSIONAL COMMITTEE',
      'DEMOCRATIC NATIONAL COMMITTEE', 'DNC',
      'REPUBLICAN NATIONAL COMMITTEE', 'RNC',
      'SENATE MAJORITY PAC', 'HOUSE MAJORITY PAC',
      'SENATE LEADERSHIP FUND', 'CONGRESSIONAL LEADERSHIP FUND',
      'EMILY''S LIST', 'END CITIZENS UNITED'
    ]) AS name
  ),
  agg AS (
    SELECT
      tp.cmte_id,
      MAX(tp.cmte_name)       AS cmte_name,
      MAX(tp.industry)        AS industry,
      SUM(tp.total_support)   AS total_contributions,
      COUNT(DISTINCT tp.bioguide_id) AS recipient_count
    FROM public.legislator_top_pacs tp
    WHERE UPPER(TRIM(tp.cmte_name)) NOT IN (SELECT name FROM skip_names)
      AND (search_text IS NULL OR tp.cmte_name ILIKE '%' || search_text || '%')
      AND (industry_filter IS NULL OR tp.industry = industry_filter)
    GROUP BY tp.cmte_id
  ),
  counted AS (
    SELECT *, COUNT(*) OVER() AS total_count
    FROM agg
    ORDER BY total_contributions DESC
    LIMIT result_limit OFFSET offset_count
  )
  SELECT
    c.cmte_id,
    c.cmte_name,
    c.industry,
    c.total_contributions,
    c.recipient_count,
    COALESCE(
      (
        SELECT jsonb_agg(r ORDER BY r->>'amount' DESC)
        FROM (
          SELECT jsonb_build_object(
            'bioguide_id', l.bioguide_id,
            'name',        l.full_name,
            'party',       l.party,
            'state',       l.state,
            'chamber',     l.chamber,
            'amount',      SUM(tp2.total_support)
          ) AS r
          FROM public.legislator_top_pacs tp2
          JOIN public.legislators l ON l.bioguide_id = tp2.bioguide_id
          WHERE tp2.cmte_id = c.cmte_id
          GROUP BY l.bioguide_id, l.full_name, l.party, l.state, l.chamber
          ORDER BY SUM(tp2.total_support) DESC
          LIMIT 5
        ) sub
      ),
      '[]'::jsonb
    ) AS top_recipients,
    c.total_count
  FROM counted c;
$$;


ALTER FUNCTION "public"."pac_leaderboard"("search_text" "text", "industry_filter" "text", "result_limit" integer, "offset_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."bill_embeddings" AS
 SELECT "bill_id",
    "congress",
    "title",
    "summary",
    "combined_text",
    "synced_at",
    "topics",
    "status",
    "bill_number",
    "sponsor_name",
    "sponsor_bioguide_id",
    "sponsor_party",
    "introduced_date",
    "policy_area",
    "congress_gov_url",
    "last_action_text",
    "last_action_date",
    "search_vector",
    "referenced_agencies",
    "referenced_laws",
    "referenced_usc"
   FROM "public"."bills";


ALTER VIEW "public"."bill_embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bill_vote_positions" (
    "vote_id" "text" NOT NULL,
    "bioguide_id" "text" NOT NULL,
    "position" "text" NOT NULL
);


ALTER TABLE "public"."bill_vote_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bill_vote_summaries" (
    "id" "text" NOT NULL,
    "bill_id" "text" NOT NULL,
    "congress" integer NOT NULL,
    "chamber" "text" NOT NULL,
    "date" "date" NOT NULL,
    "question" "text",
    "result" "text" NOT NULL,
    "required" "text",
    "yea_total" integer DEFAULT 0 NOT NULL,
    "nay_total" integer DEFAULT 0 NOT NULL,
    "present_total" integer DEFAULT 0,
    "not_voting_total" integer DEFAULT 0,
    "yea_democrat" integer,
    "nay_democrat" integer,
    "yea_republican" integer,
    "nay_republican" integer,
    "yea_independent" integer,
    "nay_independent" integer,
    "source_url" "text",
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "title" "text"
);


ALTER TABLE "public"."bill_vote_summaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bulk_import_checkpoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "script" "text" NOT NULL,
    "source_file" "text" NOT NULL,
    "chunk_index" bigint NOT NULL,
    "rows_in_chunk" integer,
    "status" "text" NOT NULL,
    "error" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "bulk_import_checkpoints_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'success'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."bulk_import_checkpoints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."committee_memberships" (
    "bioguide_id" "text" NOT NULL,
    "committee_id" "text" NOT NULL,
    "title" "text"
);


ALTER TABLE "public"."committee_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."committees" (
    "thomas_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "chamber" "text" NOT NULL,
    "url" "text",
    "parent_id" "text"
);


ALTER TABLE "public"."committees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contributor_leaderboard_cache" (
    "cmte_id" "text" NOT NULL,
    "cmte_name" "text" DEFAULT ''::"text" NOT NULL,
    "direct_total" numeric DEFAULT 0 NOT NULL,
    "ie_for_total" numeric DEFAULT 0 NOT NULL,
    "ie_against_total" numeric DEFAULT 0 NOT NULL,
    "total_contributions" numeric DEFAULT 0 NOT NULL,
    "recipient_count" bigint DEFAULT 0 NOT NULL,
    "top_recipients" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contributor_leaderboard_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fec_cmte_names" (
    "cmte_id" "text" NOT NULL,
    "cmte_name" "text" NOT NULL,
    "connected_org" "text"
);


ALTER TABLE "public"."fec_cmte_names" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."followed_politicians" (
    "user_id" "uuid" NOT NULL,
    "politician_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."followed_politicians" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."independent_expenditures" (
    "sub_id" bigint NOT NULL,
    "cmte_id" "text" NOT NULL,
    "cand_id" "text",
    "sup_opp" character(1) NOT NULL,
    "transaction_tp" "text",
    "transaction_amt" numeric(12,2) NOT NULL,
    "transaction_dt" "text",
    "cycle" smallint NOT NULL,
    CONSTRAINT "independent_expenditures_sup_opp_check" CHECK (("sup_opp" = ANY (ARRAY['S'::"bpchar", 'O'::"bpchar"])))
);


ALTER TABLE "public"."independent_expenditures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legislator_funding_summary" (
    "bioguide_id" "text" NOT NULL,
    "cycle" integer NOT NULL,
    "total_receipts" numeric,
    "pac_direct_total" numeric,
    "pac_direct_pct" numeric,
    "superpac_ie_for" numeric,
    "superpac_ie_against" numeric,
    "large_donor_total" numeric,
    "large_donor_pct" numeric,
    "small_donor_total" numeric,
    "small_donor_pct" numeric,
    "in_state_total" numeric,
    "out_of_state_total" numeric,
    "out_of_state_pct" numeric,
    "dc_donor_total" numeric,
    "top_industries" "jsonb",
    "pol_pty_total" numeric,
    "pol_pty_pct" numeric,
    "self_funded_total" numeric,
    "self_funded_pct" numeric,
    "other_total" numeric,
    "other_pct" numeric
);


ALTER TABLE "public"."legislator_funding_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legislator_top_contributors" (
    "bioguide_id" "text" NOT NULL,
    "cycle" integer NOT NULL,
    "org_name" "text" NOT NULL,
    "individual_total" numeric DEFAULT 0,
    "pac_total" numeric DEFAULT 0,
    "grand_total" numeric DEFAULT 0,
    "rank" integer,
    "cmte_id" "text"
);


ALTER TABLE "public"."legislator_top_contributors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legislator_top_pacs" (
    "bioguide_id" "text" NOT NULL,
    "cycle" integer NOT NULL,
    "cmte_id" "text" NOT NULL,
    "cmte_name" "text",
    "connected_org" "text",
    "industry" "text",
    "direct_contribution" numeric,
    "ie_for" numeric,
    "ie_against" numeric,
    "total_support" numeric,
    "rank" integer
);


ALTER TABLE "public"."legislator_top_pacs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legislators" (
    "bioguide_id" "text" NOT NULL,
    "lis_id" "text",
    "icpsr_id" integer,
    "fec_ids" "text"[],
    "govtrack_id" "text",
    "thomas_id" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "party" "text" NOT NULL,
    "chamber" "text" NOT NULL,
    "state" "text" NOT NULL,
    "state_full" "text" NOT NULL,
    "district" integer,
    "title" "text" NOT NULL,
    "in_office" boolean DEFAULT true,
    "birthday" "date",
    "gender" "text",
    "website" "text",
    "phone" "text",
    "address" "text",
    "photo_url" "text",
    "term_start" "date",
    "term_end" "date",
    "senate_class" integer,
    "next_election" integer,
    "twitter" "text",
    "facebook" "text",
    "youtube" "text",
    "raw_json" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "fec_committee_id" "text"
);


ALTER TABLE "public"."legislators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_scores" (
    "bioguide_id" "text" NOT NULL,
    "congress" integer NOT NULL,
    "chamber" "text" NOT NULL,
    "nominate_dim1" numeric(6,3),
    "nominate_dim2" numeric(6,3),
    "num_votes" integer,
    "geo_mean_prob" numeric(6,3),
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."member_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pac_to_candidate" (
    "sub_id" bigint NOT NULL,
    "cmte_id" "text" NOT NULL,
    "cand_id" "text",
    "transaction_tp" "text",
    "transaction_amt" numeric(12,2) NOT NULL,
    "transaction_dt" "text",
    "cycle" smallint NOT NULL
);


ALTER TABLE "public"."pac_to_candidate" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "script" "text" NOT NULL,
    "phase" "text",
    "bioguide_id" "text",
    "status" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "result" "jsonb",
    "error" "text",
    CONSTRAINT "pipeline_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'success'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."pipeline_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_preferences" (
    "user_id" "uuid" NOT NULL,
    "topic" "text" NOT NULL
);


ALTER TABLE "public"."topic_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracked_bills" (
    "user_id" "uuid" NOT NULL,
    "bill_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tracked_bills" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bills"
    ADD CONSTRAINT "bill_embeddings_pkey" PRIMARY KEY ("bill_id");



ALTER TABLE ONLY "public"."bill_vote_positions"
    ADD CONSTRAINT "bill_vote_positions_pkey" PRIMARY KEY ("vote_id", "bioguide_id");



ALTER TABLE ONLY "public"."bill_vote_summaries"
    ADD CONSTRAINT "bill_vote_summaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulk_import_checkpoints"
    ADD CONSTRAINT "bulk_import_checkpoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulk_import_checkpoints"
    ADD CONSTRAINT "bulk_import_checkpoints_script_source_file_chunk_index_key" UNIQUE ("script", "source_file", "chunk_index");



ALTER TABLE ONLY "public"."committee_memberships"
    ADD CONSTRAINT "committee_memberships_pkey" PRIMARY KEY ("bioguide_id", "committee_id");



ALTER TABLE ONLY "public"."committees"
    ADD CONSTRAINT "committees_pkey" PRIMARY KEY ("thomas_id");



ALTER TABLE ONLY "public"."contributor_leaderboard_cache"
    ADD CONSTRAINT "contributor_leaderboard_cache_pkey" PRIMARY KEY ("cmte_id");



ALTER TABLE ONLY "public"."fec_cmte_names"
    ADD CONSTRAINT "fec_cmte_names_pkey" PRIMARY KEY ("cmte_id");



ALTER TABLE ONLY "public"."followed_politicians"
    ADD CONSTRAINT "followed_politicians_pkey" PRIMARY KEY ("user_id", "politician_id");



ALTER TABLE ONLY "public"."independent_expenditures"
    ADD CONSTRAINT "independent_expenditures_pkey" PRIMARY KEY ("sub_id");



ALTER TABLE ONLY "public"."legislator_funding_summary"
    ADD CONSTRAINT "legislator_funding_summary_pkey" PRIMARY KEY ("bioguide_id", "cycle");



ALTER TABLE ONLY "public"."legislator_top_contributors"
    ADD CONSTRAINT "legislator_top_contributors_pkey" PRIMARY KEY ("bioguide_id", "cycle", "org_name");



ALTER TABLE ONLY "public"."legislator_top_pacs"
    ADD CONSTRAINT "legislator_top_pacs_pkey" PRIMARY KEY ("bioguide_id", "cycle", "cmte_id");



ALTER TABLE ONLY "public"."legislators"
    ADD CONSTRAINT "legislators_lis_id_key" UNIQUE ("lis_id");



ALTER TABLE ONLY "public"."legislators"
    ADD CONSTRAINT "legislators_pkey" PRIMARY KEY ("bioguide_id");



ALTER TABLE ONLY "public"."member_scores"
    ADD CONSTRAINT "member_scores_pkey" PRIMARY KEY ("bioguide_id", "congress");



ALTER TABLE ONLY "public"."pac_to_candidate"
    ADD CONSTRAINT "pac_to_candidate_pkey" PRIMARY KEY ("sub_id");



ALTER TABLE ONLY "public"."pipeline_runs"
    ADD CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_preferences"
    ADD CONSTRAINT "topic_preferences_pkey" PRIMARY KEY ("user_id", "topic");



ALTER TABLE ONLY "public"."tracked_bills"
    ADD CONSTRAINT "tracked_bills_pkey" PRIMARY KEY ("user_id", "bill_id");



CREATE INDEX "bill_embeddings_congress_idx" ON "public"."bills" USING "btree" ("congress");



CREATE INDEX "bill_embeddings_fts_idx" ON "public"."bills" USING "gin" ("search_vector");



CREATE INDEX "bill_embeddings_introduced_date_idx" ON "public"."bills" USING "btree" ("introduced_date" DESC NULLS LAST);



CREATE INDEX "bill_embeddings_policy_area_idx" ON "public"."bills" USING "btree" ("policy_area");



CREATE INDEX "bill_embeddings_status_idx" ON "public"."bills" USING "btree" ("status");



CREATE INDEX "bill_embeddings_title_trgm_idx" ON "public"."bills" USING "gin" ("title" "public"."gin_trgm_ops");



CREATE INDEX "bill_embeddings_topics_idx" ON "public"."bills" USING "gin" ("topics");



CREATE INDEX "idx_bill_embeddings_agencies" ON "public"."bills" USING "gin" ("referenced_agencies");



CREATE INDEX "idx_bill_embeddings_laws" ON "public"."bills" USING "gin" ("referenced_laws");



CREATE INDEX "idx_bvp_member" ON "public"."bill_vote_positions" USING "btree" ("bioguide_id");



CREATE INDEX "idx_bvs_bill" ON "public"."bill_vote_summaries" USING "btree" ("bill_id");



CREATE INDEX "idx_bvs_date" ON "public"."bill_vote_summaries" USING "btree" ("date" DESC);



CREATE INDEX "idx_leaderboard_cache_name_trgm" ON "public"."contributor_leaderboard_cache" USING "gin" ("cmte_name" "public"."gin_trgm_ops");



CREATE INDEX "idx_leaderboard_cache_total" ON "public"."contributor_leaderboard_cache" USING "btree" ("total_contributions" DESC);



CREATE INDEX "idx_legislators_chamber" ON "public"."legislators" USING "btree" ("chamber");



CREATE INDEX "idx_legislators_fec_ids" ON "public"."legislators" USING "gin" ("fec_ids");



CREATE INDEX "idx_legislators_icpsr" ON "public"."legislators" USING "btree" ("icpsr_id");



CREATE INDEX "idx_legislators_lis" ON "public"."legislators" USING "btree" ("lis_id");



CREATE INDEX "idx_legislators_state" ON "public"."legislators" USING "btree" ("state");



CREATE INDEX "idx_top_contributors_bioguide_cycle" ON "public"."legislator_top_contributors" USING "btree" ("bioguide_id", "cycle");



CREATE INDEX "idx_top_contributors_org_name" ON "public"."legislator_top_contributors" USING "btree" ("org_name");



CREATE INDEX "idx_top_pacs_bioguide_cycle" ON "public"."legislator_top_pacs" USING "btree" ("bioguide_id", "cycle");



CREATE INDEX "idx_top_pacs_cmte_id" ON "public"."legislator_top_pacs" USING "btree" ("cmte_id");



CREATE INDEX "idx_top_pacs_industry" ON "public"."legislator_top_pacs" USING "btree" ("industry");



CREATE INDEX "ie_cand_idx" ON "public"."independent_expenditures" USING "btree" ("cand_id");



CREATE INDEX "ie_cmte_idx" ON "public"."independent_expenditures" USING "btree" ("cmte_id");



CREATE INDEX "ie_cycle_idx" ON "public"."independent_expenditures" USING "btree" ("cycle");



CREATE INDEX "pac_to_cand_cand_idx" ON "public"."pac_to_candidate" USING "btree" ("cand_id");



CREATE INDEX "pac_to_cand_cmte_idx" ON "public"."pac_to_candidate" USING "btree" ("cmte_id");



CREATE INDEX "pac_to_cand_cycle_idx" ON "public"."pac_to_candidate" USING "btree" ("cycle");



CREATE INDEX "pipeline_runs_bioguide_idx" ON "public"."pipeline_runs" USING "btree" ("bioguide_id", "started_at" DESC) WHERE ("bioguide_id" IS NOT NULL);



CREATE INDEX "pipeline_runs_script_started_idx" ON "public"."pipeline_runs" USING "btree" ("script", "started_at" DESC);



CREATE OR REPLACE TRIGGER "bill_embeddings_search_vector_trigger" BEFORE INSERT OR UPDATE ON "public"."bills" FOR EACH ROW EXECUTE FUNCTION "public"."bill_embeddings_search_vector_update"();



ALTER TABLE ONLY "public"."bill_vote_positions"
    ADD CONSTRAINT "bill_vote_positions_bioguide_id_fkey" FOREIGN KEY ("bioguide_id") REFERENCES "public"."legislators"("bioguide_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bill_vote_positions"
    ADD CONSTRAINT "bill_vote_positions_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "public"."bill_vote_summaries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."committee_memberships"
    ADD CONSTRAINT "committee_memberships_bioguide_id_fkey" FOREIGN KEY ("bioguide_id") REFERENCES "public"."legislators"("bioguide_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."committee_memberships"
    ADD CONSTRAINT "committee_memberships_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("thomas_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."committees"
    ADD CONSTRAINT "committees_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."committees"("thomas_id");



ALTER TABLE ONLY "public"."followed_politicians"
    ADD CONSTRAINT "followed_politicians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_scores"
    ADD CONSTRAINT "member_scores_bioguide_id_fkey" FOREIGN KEY ("bioguide_id") REFERENCES "public"."legislators"("bioguide_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_runs"
    ADD CONSTRAINT "pipeline_runs_bioguide_id_fkey" FOREIGN KEY ("bioguide_id") REFERENCES "public"."legislators"("bioguide_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_preferences"
    ADD CONSTRAINT "topic_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracked_bills"
    ADD CONSTRAINT "tracked_bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Public read access" ON "public"."fec_cmte_names" FOR SELECT USING (true);



CREATE POLICY "Public read bulk_import_checkpoints" ON "public"."bulk_import_checkpoints" FOR SELECT USING (true);



CREATE POLICY "Public read independent_expenditures" ON "public"."independent_expenditures" FOR SELECT USING (true);



CREATE POLICY "Public read legislator_funding_summary" ON "public"."legislator_funding_summary" FOR SELECT USING (true);



CREATE POLICY "Public read legislator_top_contributors" ON "public"."legislator_top_contributors" FOR SELECT USING (true);



CREATE POLICY "Public read legislator_top_pacs" ON "public"."legislator_top_pacs" FOR SELECT USING (true);



CREATE POLICY "Public read pac_to_candidate" ON "public"."pac_to_candidate" FOR SELECT USING (true);



CREATE POLICY "Public read pipeline_runs" ON "public"."pipeline_runs" FOR SELECT USING (true);



CREATE POLICY "allow_read" ON "public"."contributor_leaderboard_cache" FOR SELECT USING (true);



ALTER TABLE "public"."bill_vote_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bill_vote_summaries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bulk_import_checkpoints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."committee_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."committees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contributor_leaderboard_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fec_cmte_names" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."followed_politicians" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."independent_expenditures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legislator_funding_summary" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legislator_top_contributors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legislator_top_pacs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legislators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."member_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pac_to_candidate" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read bill_embeddings" ON "public"."bills" FOR SELECT USING (true);



CREATE POLICY "public read bill_vote_positions" ON "public"."bill_vote_positions" FOR SELECT USING (true);



CREATE POLICY "public read bill_vote_summaries" ON "public"."bill_vote_summaries" FOR SELECT USING (true);



CREATE POLICY "public read committee_memberships" ON "public"."committee_memberships" FOR SELECT USING (true);



CREATE POLICY "public read committees" ON "public"."committees" FOR SELECT USING (true);



CREATE POLICY "public read legislators" ON "public"."legislators" FOR SELECT USING (true);



CREATE POLICY "public read member_scores" ON "public"."member_scores" FOR SELECT USING (true);



ALTER TABLE "public"."topic_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracked_bills" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can delete own followed politicians" ON "public"."followed_politicians" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can delete own topic preferences" ON "public"."topic_preferences" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can delete own tracked bills" ON "public"."tracked_bills" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can insert own followed politicians" ON "public"."followed_politicians" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users can insert own topic preferences" ON "public"."topic_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users can insert own tracked bills" ON "public"."tracked_bills" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "users can view own followed politicians" ON "public"."followed_politicians" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "users can view own topic preferences" ON "public"."topic_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can view own tracked bills" ON "public"."tracked_bills" FOR SELECT USING (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."bill_embeddings_search_vector_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."bill_embeddings_search_vector_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bill_embeddings_search_vector_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."contributor_leaderboard"("search_text" "text", "result_limit" integer, "offset_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."contributor_leaderboard"("search_text" "text", "result_limit" integer, "offset_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."contributor_leaderboard"("search_text" "text", "result_limit" integer, "offset_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_bills_by_topic"("topic_slug" "text", "match_count" integer, "status_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_bills_by_topic"("topic_slug" "text", "match_count" integer, "status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bills_by_topic"("topic_slug" "text", "match_count" integer, "status_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unembedded_bills"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_unembedded_bills"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unembedded_bills"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hybrid_bill_search"("query_text" "text", "result_limit" integer, "offset_count" integer, "status_filter" "text", "topic_filter" "text", "policy_areas" "text"[], "congress_filter" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."hybrid_bill_search"("query_text" "text", "result_limit" integer, "offset_count" integer, "status_filter" "text", "topic_filter" "text", "policy_areas" "text"[], "congress_filter" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hybrid_bill_search"("query_text" "text", "result_limit" integer, "offset_count" integer, "status_filter" "text", "topic_filter" "text", "policy_areas" "text"[], "congress_filter" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



GRANT ALL ON TABLE "public"."bills" TO "anon";
GRANT ALL ON TABLE "public"."bills" TO "authenticated";
GRANT ALL ON TABLE "public"."bills" TO "service_role";



GRANT ALL ON FUNCTION "public"."lookup_bill"("query_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lookup_bill"("query_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_bill"("query_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pac_detail"("target_cmte_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pac_detail"("target_cmte_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pac_detail"("target_cmte_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pac_leaderboard"("search_text" "text", "industry_filter" "text", "result_limit" integer, "offset_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pac_leaderboard"("search_text" "text", "industry_filter" "text", "result_limit" integer, "offset_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pac_leaderboard"("search_text" "text", "industry_filter" "text", "result_limit" integer, "offset_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";









GRANT ALL ON TABLE "public"."bill_embeddings" TO "anon";
GRANT ALL ON TABLE "public"."bill_embeddings" TO "authenticated";
GRANT ALL ON TABLE "public"."bill_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."bill_vote_positions" TO "anon";
GRANT ALL ON TABLE "public"."bill_vote_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."bill_vote_positions" TO "service_role";



GRANT ALL ON TABLE "public"."bill_vote_summaries" TO "anon";
GRANT ALL ON TABLE "public"."bill_vote_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."bill_vote_summaries" TO "service_role";



GRANT ALL ON TABLE "public"."bulk_import_checkpoints" TO "anon";
GRANT ALL ON TABLE "public"."bulk_import_checkpoints" TO "authenticated";
GRANT ALL ON TABLE "public"."bulk_import_checkpoints" TO "service_role";



GRANT ALL ON TABLE "public"."committee_memberships" TO "anon";
GRANT ALL ON TABLE "public"."committee_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."committee_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."committees" TO "anon";
GRANT ALL ON TABLE "public"."committees" TO "authenticated";
GRANT ALL ON TABLE "public"."committees" TO "service_role";



GRANT ALL ON TABLE "public"."contributor_leaderboard_cache" TO "anon";
GRANT ALL ON TABLE "public"."contributor_leaderboard_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."contributor_leaderboard_cache" TO "service_role";



GRANT ALL ON TABLE "public"."fec_cmte_names" TO "anon";
GRANT ALL ON TABLE "public"."fec_cmte_names" TO "authenticated";
GRANT ALL ON TABLE "public"."fec_cmte_names" TO "service_role";



GRANT ALL ON TABLE "public"."followed_politicians" TO "anon";
GRANT ALL ON TABLE "public"."followed_politicians" TO "authenticated";
GRANT ALL ON TABLE "public"."followed_politicians" TO "service_role";



GRANT ALL ON TABLE "public"."independent_expenditures" TO "anon";
GRANT ALL ON TABLE "public"."independent_expenditures" TO "authenticated";
GRANT ALL ON TABLE "public"."independent_expenditures" TO "service_role";



GRANT ALL ON TABLE "public"."legislator_funding_summary" TO "anon";
GRANT ALL ON TABLE "public"."legislator_funding_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."legislator_funding_summary" TO "service_role";



GRANT ALL ON TABLE "public"."legislator_top_contributors" TO "anon";
GRANT ALL ON TABLE "public"."legislator_top_contributors" TO "authenticated";
GRANT ALL ON TABLE "public"."legislator_top_contributors" TO "service_role";



GRANT ALL ON TABLE "public"."legislator_top_pacs" TO "anon";
GRANT ALL ON TABLE "public"."legislator_top_pacs" TO "authenticated";
GRANT ALL ON TABLE "public"."legislator_top_pacs" TO "service_role";



GRANT ALL ON TABLE "public"."legislators" TO "anon";
GRANT ALL ON TABLE "public"."legislators" TO "authenticated";
GRANT ALL ON TABLE "public"."legislators" TO "service_role";



GRANT ALL ON TABLE "public"."member_scores" TO "anon";
GRANT ALL ON TABLE "public"."member_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."member_scores" TO "service_role";



GRANT ALL ON TABLE "public"."pac_to_candidate" TO "anon";
GRANT ALL ON TABLE "public"."pac_to_candidate" TO "authenticated";
GRANT ALL ON TABLE "public"."pac_to_candidate" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_runs" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_runs" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."topic_preferences" TO "anon";
GRANT ALL ON TABLE "public"."topic_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."tracked_bills" TO "anon";
GRANT ALL ON TABLE "public"."tracked_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."tracked_bills" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



