import type { Party } from './party'

export type BillStatus = 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'

export interface BillSummary {
  id: string
  number: string
  title: string
  sponsor: string
  party: Party
  status: BillStatus
  topics: string[]
  lastAction: string
  lastActionTimestamp: number
  summary: string
}

export interface BillSponsor {
  name: string
  bioguideId: string
  party: string
  state: string
  district: string | null
}

export interface BillCosponsor {
  name: string
  bioguideId: string
  party: string
  state: string
}

export interface BillAction {
  date: string
  text: string
  type: string
}

export interface PartyBreakdown {
  democrat:    { yea: number; nay: number }
  republican:  { yea: number; nay: number }
  independent: { yea: number; nay: number }
}

export interface BillVoteMemberPosition {
  bioguideId: string
  name:       string
  party:      string
  state:      string
  photoUrl:   string | null
  position:   string
}

export interface BillVote {
  id:              string | null
  date:            string
  chamber:         'House' | 'Senate'
  question:        string | null
  result:          string | null
  required:        string | null
  yeas:            number | null
  nays:            number | null
  present:         number | null
  notVoting:       number | null
  partyBreakdown:  PartyBreakdown | null
  memberPositions: BillVoteMemberPosition[]
  sourceUrl:       string | null
}

export interface BillDetail {
  id: string
  number: string
  title: string
  congress: number
  introducedDate: string
  status: BillStatus
  summary: string
  sponsor: BillSponsor | null
  cosponsors: BillCosponsor[]
  policyArea: string | null
  topics: string[]
  subjects: string[]
  congressGovUrl: string
  actions: BillAction[]
  votes: BillVote[]
  _hasDetailedVotes: boolean
}
