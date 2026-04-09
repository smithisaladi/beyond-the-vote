'use client'

import { useState, useEffect } from 'react'
import type { Party } from '@/lib/types'

export interface DonorAlignment {
  donorName: string
  donorAmount: number | null
  donorLikelyPosition: 'support' | 'oppose' | 'neutral'
  voteAligns: boolean
  explanation: string
}

interface PoliticianVote {
  id: string
  bill: string
  billId: string | null
  date: string
  vote: 'Yea' | 'Nay'
  donorAlignments: DonorAlignment[]
}

interface PoliticianBill {
  id: string
  name: string
  number: string
  status: 'Passed' | 'Pending' | 'Failed'
  date: string
}

interface Donor {
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
}

interface Committee {
  name: string
  url: string | null
  title: string | null
}

interface FundingBreakdown {
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
  cycle: number
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
  stats: {
    yearsInOffice: number
    attendance: number | null
    ideologyScore: number | null
  }
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

export function useFetchPoliticianDetail(id: string): {
  politician: Politician | null
  loading: boolean
  error: string | null
} {
  const [politician, setPolitician] = useState<Politician | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/politicians/${id}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load')
        setPolitician(data.politician)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  return { politician, loading, error }
}
