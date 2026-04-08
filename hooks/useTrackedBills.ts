'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useTrackedBills(userId: string | null) {
  const [trackedBills, setTrackedBills] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) { setTrackedBills(new Set()); return }
    const supabase = createClient()
    setLoading(true)
    setError(null)
    supabase
      .from('tracked_bills')
      .select('bill_id')
      .eq('user_id', userId)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else if (data) setTrackedBills(new Set(data.map((r: { bill_id: string }) => r.bill_id)))
        setLoading(false)
      })
  }, [userId])

  const toggleTrack = async (billId: string) => {
    if (!userId) return
    const supabase = createClient()
    const isTracked = trackedBills.has(billId)
    const next = new Set(trackedBills)
    isTracked ? next.delete(billId) : next.add(billId)
    setTrackedBills(next) // optimistic

    const { error: err } = isTracked
      ? await supabase.from('tracked_bills').delete().eq('user_id', userId).eq('bill_id', billId)
      : await supabase.from('tracked_bills').insert({ user_id: userId, bill_id: billId })

    if (err) {
      setTrackedBills(new Set(trackedBills)) // revert
      setError(err.message)
    }
  }

  return { trackedBills, toggleTrack, loading, error }
}
