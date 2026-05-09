-- One-time bootstrap. Run this against a NEW Supabase project as the
-- privileged `postgres` role (Supabase Studio's SQL editor or psql with
-- the project owner connection string). It is NOT picked up by Flyway —
-- role and grant management requires superuser privileges and shouldn't
-- happen on every backend boot.
--
-- After this script runs, set the runtime env vars:
--   Spring Boot:  DATABASE_USER=app,      DATABASE_PASSWORD=<above>
--   Pipeline:     PIPELINE_DATABASE_URL points at the same DB as user `pipeline`
--
-- Re-running is safe: every block is idempotent.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'app') then
        create role app with login password 'CHANGE_ME_APP_PASSWORD' bypassrls;
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'pipeline') then
        create role pipeline with login password 'CHANGE_ME_PIPELINE_PASSWORD';
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- Schema-level grants
-- ---------------------------------------------------------------------------

grant usage on schema public to app, pipeline;

-- The `app` role is the JPA owner: needs CREATE so Flyway can create its
-- own bookkeeping table (flyway_schema_history) on first migration run.
grant create on schema public to app;

-- ---------------------------------------------------------------------------
-- App-owned tables — full DML for Spring Boot, NO access for the pipeline
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
    public.app_users,
    public.profiles,
    public.refresh_tokens,
    public.password_reset_tokens,
    public.tracked_bills,
    public.followed_politicians,
    public.topic_preferences
to app;

-- Sequences for any default-generated identity columns (Hibernate uses
-- gen_random_uuid() so this is forward-compat; harmless if no sequences exist).
grant usage, select on all sequences in schema public to app;

-- ---------------------------------------------------------------------------
-- Pipeline-owned tables — full DML for the pipeline, SELECT-only for Spring Boot
-- ---------------------------------------------------------------------------

-- Spring Boot reads pipeline data to render bills, legislators, donors, etc.
grant select on
    public.bills,
    public.bill_vote_positions,
    public.bill_vote_summaries,
    public.bulk_import_checkpoints,
    public.committees,
    public.committee_memberships,
    public.contributor_leaderboard_cache,
    public.fec_cmte_names,
    public.independent_expenditures,
    public.legislators,
    public.legislator_funding_summary,
    public.legislator_top_contributors,
    public.legislator_top_pacs,
    public.member_scores,
    public.pac_to_candidate,
    public.pipeline_runs
to app;

-- The pipeline writes everything pipeline-owned.
grant select, insert, update, delete on
    public.bills,
    public.bill_vote_positions,
    public.bill_vote_summaries,
    public.bulk_import_checkpoints,
    public.committees,
    public.committee_memberships,
    public.contributor_leaderboard_cache,
    public.fec_cmte_names,
    public.independent_expenditures,
    public.legislators,
    public.legislator_funding_summary,
    public.legislator_top_contributors,
    public.legislator_top_pacs,
    public.member_scores,
    public.pac_to_candidate,
    public.pipeline_runs
to pipeline;

-- Pipeline must NOT see app-owned data. Postgres defaults to "no privileges"
-- so the absence of a grant is the deny — no explicit revoke needed unless
-- a previous bootstrap was overly permissive. If you're rerunning after a
-- looser earlier setup, uncomment:
--   revoke all on public.app_users, public.profiles, public.refresh_tokens,
--                  public.password_reset_tokens, public.tracked_bills,
--                  public.followed_politicians, public.topic_preferences
--          from pipeline;
