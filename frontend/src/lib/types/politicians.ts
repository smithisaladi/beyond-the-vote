import type { Party } from './party'

export interface DonorAlignment {
  donorName: string
  donorAmount: number | null
  donorLikelyPosition: 'support' | 'oppose' | 'neutral'
  voteAligns: boolean
  explanation: string
}

export interface PoliticianVote {
  id: string
  bill: string
  billId: string | null
  billTitle: string
  date: string
  vote: 'Yea' | 'Nay'
  question: string | null
  donorAlignments: DonorAlignment[]
}

export interface PoliticianBill {
  id: string
  name: string
  number: string
  status: 'Passed' | 'Pending' | 'Failed'
  date: string
}

export interface Donor {
  rank: number
  name: string
  amount: string
  category: string
  summary?: string
}

export interface TopContributor {
  rank: number
  orgName: string
  total: string
  cmteId?: string | null
}

export interface Committee {
  name: string
  url: string | null
  title: string | null
}

export interface FundingBreakdown {
  pac: number
  pacPct: number
  individualLarge: number
  individualLargePct: number
  individualSmall: number
  individualSmallPct: number
  partyContributions: number
  partyContributionsPct: number
  selfFunded: number
  selfFundedPct: number
  other: number
  otherPct: number
  total: number
  superPacFor: number
  superPacAgainst: number
  inStateTotal: number
  outOfStateTotal: number
  inStatePct: number
  outOfStatePct: number
  cycle: number
  minCycle?: number
}

export interface PoliticianStats {
  yearsInOffice: number
  attendance: number | null
  ideologyScore: number | null
}

export interface Politician {
  id: string
  bioguideId: string
  name: string
  title: string
  party: Party
  state: string
  stateCode: string
  district?: string
  since: string | null
  photo: string | null
  photoCredit: string | null
  website: string | null
  address: string | null
  phone: string | null
  fecUrl: string | null
  nextElectionYear: number | null
  stats: PoliticianStats
  votes: PoliticianVote[]
  bills: PoliticianBill[]
  donors: Donor[]
  pacDonors: Donor[]
  topContributors: TopContributor[]
  fundingBreakdown?: FundingBreakdown | null
  committees: Committee[]
  donorAlignmentSyncedAt?: string | null
  donorAlignmentIsStale?: boolean
}
