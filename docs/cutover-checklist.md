# Cutover Checklist

## Pre-cutover
- [ ] Run `pnpm build` in apps/web — verify zero errors
- [ ] Run full test suite: `cd apps/api && uv run pytest tests/ -v`
- [ ] Run pipeline test suite: `cd pipeline && uv run pytest tests/ -v`
- [ ] Verify FastAPI deployed on Render and /healthz returns 200
- [ ] Verify Vite SPA builds and renders on Vercel preview
- [ ] Test auth flow: sign up, sign in, sign out
- [ ] Test all routes: bills, politicians, donors, dashboard, settings, representatives
- [ ] Verify OpenAPI schema: `curl http://api-url/openapi.json | jq .paths | wc -l`

## Cutover steps
1. Deploy Vite SPA to Vercel production
2. Update DNS / Vercel project settings to point to new SPA
3. Verify all routes work on production URL
4. Decommission old Next.js Vercel deployment (delete or pause)

## Post-cutover
- [ ] Verify Sentry receiving events from new SPA
- [ ] Verify FastAPI logs in Render dashboard
- [ ] Monitor error rates for 24 hours
- [ ] Remove old Next.js code from repo (Phase 6 cleanup PR)

## Cleanup (separate PR)
- Remove: `app/`, `components/`, `hooks/`, `lib/` (root-level Next.js code)
- Remove: `middleware.ts`, `next.config.ts`, `next-env.d.ts`
- Remove: Next.js dependencies from root `package.json`
- Keep: `pipeline/`, `apps/`, `docs/`, `supabase/`, `e2e/`
