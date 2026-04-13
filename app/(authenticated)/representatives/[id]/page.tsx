/**
 * `/representatives/[id]` — legislator detail view.
 *
 * Thin server-component shim. The sibling `layout.tsx` generates dynamic
 * metadata (title, description, OG image) from the legislator's Supabase
 * row. The actual UI is a client component in `components/representatives/`.
 *
 * The `[id]` param is a Bioguide ID (e.g. `P000197` for Nancy Pelosi).
 */

export { default } from '@/components/representatives/RepresentativeDetailPage'
