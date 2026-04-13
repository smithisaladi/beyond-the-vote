import postgres from 'postgres'

// Direct Postgres client for queries that need raw SQL (FTS, trigram, FULL OUTER
// JOIN, jsonb aggregation) — anything PostgREST can't express. Supabase JS
// remains the right tool for simple CRUD + auth/RLS.
//
// DATABASE_URL should be Supabase's pooled connection string (port 6543,
// pgbouncer). Transaction-mode pooling requires `prepare: false`.

declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined
}

export const sql =
  globalThis.__pg ??
  postgres(process.env.DATABASE_URL!, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })

if (process.env.NODE_ENV !== 'production') globalThis.__pg = sql
