'use client'

import { useState, useEffect } from 'react'
import type { Politician } from '@/lib/types/politicians'

export type {
  Politician,
  PoliticianStats,
  PoliticianVote,
  PoliticianBill,
  DonorAlignment,
  Donor,
  TopContributor,
  Committee,
  FundingBreakdown,
} from '@/lib/types/politicians'

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
