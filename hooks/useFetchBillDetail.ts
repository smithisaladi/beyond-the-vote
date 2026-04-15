'use client'

import { useState, useEffect } from 'react'

export type BillDetailStatus = 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'

interface Sponsor {
  name: string
  bioguideId: string
  party: string
  state: string
  district: string | null
}

interface Cosponsor {
  name: string
  bioguideId: string
  party: string
  state: string
}

interface Action {
  date: string
  text: string
  type: string
}

interface PartyBreakdown {
  democrat:    { yea: number; nay: number }
  republican:  { yea: number; nay: number }
  independent: { yea: number; nay: number }
}

interface MemberPosition {
  bioguideId: string
  name:       string
  party:      string
  state:      string
  photoUrl:   string | null
  position:   string
}

interface Vote {
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
  memberPositions: MemberPosition[]
  sourceUrl:       string | null
}

export type { PartyBreakdown, MemberPosition, Vote }

export interface BillDetail {
  id: string
  number: string
  title: string
  congress: number
  introducedDate: string
  status: BillDetailStatus
  summary: string
  sponsor: Sponsor | null
  cosponsors: Cosponsor[]
  policyArea: string | null
  subjects: string[]
  congressGovUrl: string
  actions: Action[]
  votes: Vote[]
}

export function useFetchBillDetail(id: string, initialBill?: BillDetail | null): {
  bill: BillDetail | null
  loading: boolean
  error: string | null
} {
  const [bill, setBill] = useState<BillDetail | null>(initialBill ?? null)
  const [loading, setLoading] = useState(!initialBill)
  const [error, setError] = useState<string | null>(null)

  // Full fetch when no initialBill provided (legacy path)
  useEffect(() => {
    if (initialBill || !id) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/bills/${id}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load')
        setBill(data.bill)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err.message)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [id, initialBill])

  // Background enrichment when initialBill provided (cosponsors, subjects, actions from Congress.gov)
  useEffect(() => {
    if (!initialBill || !id) return
    const controller = new AbortController()
    fetch(`/api/bills/${id}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.bill) return
        setBill(prev => prev ? {
          ...prev,
          cosponsors: data.bill.cosponsors?.length > 0 ? data.bill.cosponsors : prev.cosponsors,
          subjects: data.bill.subjects?.length > 0 ? data.bill.subjects : prev.subjects,
          actions: data.bill.actions?.length > prev.actions.length ? data.bill.actions : prev.actions,
          sponsor: data.bill.sponsor ?? prev.sponsor,
          summary: data.bill.summary || prev.summary,
        } : prev)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [id, initialBill])

  return { bill, loading, error }
}
