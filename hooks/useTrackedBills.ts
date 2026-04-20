'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useTrackedBills(userId: string | null) {
  const [trackedBills, setTrackedBills] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) { setTrackedBills(new Set()); return }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch('/api/dashboard/tracked-bills', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load tracked bills')
        const { bills } = await res.json()
        setTrackedBills(new Set((bills ?? []).map((b: { id: string }) => b.id)))
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err.message)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [userId])

  const toggleTrack = async (billId: string) => {
    if (!userId) return
    const supabase = createClient()
    const isTracked = trackedBills.has(billId)
    const prev = new Set(trackedBills) // capture before mutation
    const next = new Set(trackedBills)
    isTracked ? next.delete(billId) : next.add(billId)
    setTrackedBills(next) // optimistic

    const { error: err } = isTracked
      ? await supabase.from('tracked_bills').delete().eq('user_id', userId).eq('bill_id', billId)
      : await supabase.from('tracked_bills').insert({ user_id: userId, bill_id: billId })

    if (err) {
      setTrackedBills(prev) // revert to captured state
      setError(err.message)
    }
  }

  return { trackedBills, toggleTrack, loading, error }
}
