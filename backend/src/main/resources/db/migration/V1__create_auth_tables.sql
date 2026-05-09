-- First Flyway migration. The pre-existing schema (bills, legislators, donors,
-- profiles, tracked_bills, etc.) is treated as baseline V0 — it lives in
-- supabase/migrations/*.sql as historical record only.
--
-- This migration brings the app-owned auth tables into version control:
--   * app_users               — Spring Boot's user identity (replaces auth.users)
--   * refresh_tokens          — opaque, hashed, single-use rotation
--   * password_reset_tokens   — for the deferred password-reset flow
--
-- All statements are idempotent. The user may have created some of these
-- tables by hand to satisfy Hibernate's `ddl-auto: validate`; this migration
-- catches up the remainder.

create table if not exists app_users (
    id            uuid        primary key default gen_random_uuid(),
    email         text        unique not null,
    password_hash text        not null,
    full_name     text,
    created_at    timestamptz default now(),
    updated_at    timestamptz
);

create table if not exists refresh_tokens (
    id          uuid        primary key default gen_random_uuid(),
    token_hash  bytea       unique not null,
    user_id     uuid        not null references app_users(id) on delete cascade,
    expires_at  timestamptz not null,
    revoked_at  timestamptz,
    used_at     timestamptz,
    replaced_by bytea,
    created_at  timestamptz not null default now()
);

create index if not exists refresh_tokens_user_id_idx on refresh_tokens (user_id);
create index if not exists refresh_tokens_active_expiry_idx
    on refresh_tokens (expires_at)
    where revoked_at is null and used_at is null;

create table if not exists password_reset_tokens (
    id         uuid        primary key default gen_random_uuid(),
    token_hash bytea       unique not null,
    user_id    uuid        not null references app_users(id) on delete cascade,
    expires_at timestamptz not null,
    used_at    timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx on password_reset_tokens (user_id);
