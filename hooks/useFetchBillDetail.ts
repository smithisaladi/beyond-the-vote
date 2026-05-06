'use client'

import { useState, useEffect } from 'react'
import type { BillDetail } from '@/lib/types/bills'

export type {
  BillVote as Vote,
  BillVoteMemberPosition as MemberPosition,
  PartyBreakdown,
  BillDetail,
} from '@/lib/types/bills'

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
          topics: data.bill.topics?.length > 0 ? data.bill.topics : prev.topics,
          subjects: data.bill.subjects?.length > 0 ? data.bill.subjects : prev.subjects,
          actions: data.bill.actions?.length > prev.actions.length ? data.bill.actions : prev.actions,
          sponsor: data.bill.sponsor ?? prev.sponsor,
          summary: data.bill.summary || prev.summary,
        } : prev)
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('[bill-detail] enrichment failed:', err)
      })
    return () => controller.abort()
  }, [id, initialBill])

  return { bill, loading, error }
}
