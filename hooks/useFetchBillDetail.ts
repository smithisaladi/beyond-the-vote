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

interface Vote {
  date: string
  chamber: 'House' | 'Senate'
  yeas: number | null
  nays: number | null
  url: string | null
}

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

export function useFetchBillDetail(id: string): {
  bill: BillDetail | null
  loading: boolean
  error: string | null
} {
  const [bill, setBill] = useState<BillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/bills/${id}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load')
        setBill(data.bill)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  return { bill, loading, error }
}
