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

/** Shape returned by hybridBillSearch (RRF combined FTS+trigram). */
export type BillSearchRow = BillRow

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
  legislators?: {
    full_name: string | null
    party: string | null
    state: string | null
    photo_url: string | null
  } | null
}
