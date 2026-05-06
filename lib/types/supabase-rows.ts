import type { BillStatus } from './bills'

/** Subset of `bills` table columns that API routes read. */
export interface BillRow {
  bill_id: string
  bill_number: string | null
  title: string
  status: BillStatus | null
  topics: string[] | null
  introduced_date: string | null
  last_action_date: string | null
  last_action_text: string | null
  summary: string | null
  sponsor_bioguide_id: string | null
  sponsor_name: string | null
  sponsor_party: string | null
}

/** Subset of `legislators` columns used for sponsor enrichment. */
export interface LegislatorLite {
  bioguide_id: string
  full_name: string
  party: string
}

/** `bill_vote_summaries` row used in /api/bills/[id]. */
export interface BillVoteSummaryRow {
  id: string
  chamber: string
  date: string
  title: string | null
  question: string
  result: string
  required: string | null
  yea_total: number
  nay_total: number
  present_total: number
  not_voting_total: number
  yea_democrat: number | null
  nay_democrat: number | null
  yea_republican: number | null
  nay_republican: number | null
  yea_independent: number | null
  nay_independent: number | null
  source_url: string | null
  bill_vote_positions?: BillVotePositionRow[]
}

export interface BillVotePositionRow {
  bioguide_id: string
  position: string
  /**
   * Joined `legislators` row. Supabase's nested-relation inference types this
   * as an array because `legislators` is a parent table; in practice the FK is
   * single-row, so we model it as `{...} | null`. This mismatch is why the
   * fetch site uses an `as unknown as BillVoteSummaryRow[]` bridge.
   */
  legislators?: {
    full_name: string | null
    party: string | null
    state: string | null
    photo_url: string | null
  } | null
}
