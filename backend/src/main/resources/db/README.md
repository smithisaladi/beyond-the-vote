# Database setup

Two layers, applied in this order:

```
db/setup/        — one-shot, run manually as DB superuser  (roles & grants)
db/migration/    — Flyway, applied on every Spring Boot boot
```

## Bootstrap order (new environment)

1. **Provision Postgres** — Supabase project (gives you the `auth` schema, `postgres` role, extensions). The pipeline-owned tables (bills, legislators, etc.) come from `../../../../../supabase/migrations/*.sql`, applied via `supabase db push`. They are pre-Flyway baseline; Flyway treats them as version 0.

2. **Create roles + grants** — once per environment, as the privileged `postgres` role:
   ```bash
   psql "$SUPERUSER_URL" -f db/setup/01_roles_and_grants.sql
   ```
   Replace the `CHANGE_ME_*` passwords first. After this, two roles exist: `app` (Spring Boot, BYPASSRLS, full DML on app-owned + SELECT on pipeline-owned) and `pipeline` (no access to app-owned).

3. **Boot the app** — Spring Boot connects as the `app` role and runs Flyway, applying everything in `db/migration/` from `V1` upward.

## Adding a new migration

Drop a file into `db/migration/V<n>__<short_name>.sql` where `<n>` is the next integer. Migrations are applied in numerical order, exactly once per database.

- Make every statement idempotent (`if exists` / `if not exists`) — the live database may have been hand-modified before Flyway took over.
- App-owned tables are fair game.
- Pipeline-owned tables (see `pipeline/CLAUDE.md`) need coordination with the pipeline team.

## Why a manual bootstrap script

Role creation and `GRANT` on cross-owner objects need the `postgres` superuser, which the runtime `app` role intentionally lacks. Putting that into Flyway would either require elevated runtime privileges (bad) or fail when run as `app` (worse). One-shot scripts in `db/setup/` keep that privilege boundary clean.
