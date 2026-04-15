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
  billTitle: string
  date: string
  vote: 'Yea' | 'Nay'
  question: string | null
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
  inStateTotal: number
  outOfStateTotal: number
  inStatePct: number
  outOfStatePct: number
  cycle: number
  minCycle?: number
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

export function useFetchPoliticianDetail(id: string, initialPolitician?: Politician | null): {
  politician: Politician | null
  loading: boolean
  error: string | null
} {
  const [politician, setPolitician] = useState<Politician | null>(initialPolitician ?? null)
  const [loading, setLoading] = useState(!initialPolitician)
  const [error, setError] = useState<string | null>(null)

  // Full fetch when no initialPolitician provided (legacy path)
  useEffect(() => {
    if (initialPolitician || !id) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/politicians/${id}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load')
        setPolitician(data.politician)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err.message)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [id, initialPolitician])

  // Background enrichment when initialPolitician provided (sponsored bills from Congress.gov)
  useEffect(() => {
    if (!initialPolitician || !id) return
    const controller = new AbortController()
    fetch(`/api/politicians/${id}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.politician) return
        setPolitician(prev => prev ? {
          ...prev,
          bills: data.politician.bills?.length > 0 ? data.politician.bills : prev.bills,
          photoCredit: data.politician.photoCredit ?? prev.photoCredit,
          votes: data.politician.votes?.length > prev.votes.length ? data.politician.votes : prev.votes,
        } : prev)
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('[politician-detail] enrichment failed:', err)
      })
    return () => controller.abort()
  }, [id, initialPolitician])

  return { politician, loading, error }
}
