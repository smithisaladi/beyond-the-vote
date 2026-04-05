'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useTrackedBills(userId: string | null) {
  const [trackedBills, setTrackedBills] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) { setTrackedBills(new Set()); return }
    const supabase = createClient()
    supabase
      .from('tracked_bills')
      .select('bill_id')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (data) setTrackedBills(new Set(data.map((r: { bill_id: string }) => r.bill_id)))
      })
  }, [userId])

  const toggleTrack = async (billId: string) => {
    if (!userId) return
    const supabase = createClient()
    const isTracked = trackedBills.has(billId)
    const next = new Set(trackedBills)
    isTracked ? next.delete(billId) : next.add(billId)
    setTrackedBills(next) // optimistic

    const { error } = isTracked
      ? await supabase.from('tracked_bills').delete().eq('user_id', userId).eq('bill_id', billId)
      : await supabase.from('tracked_bills').insert({ user_id: userId, bill_id: billId })

    if (error) {
      const reverted = new Set(trackedBills)
      setTrackedBills(reverted)
    }
  }

  return { trackedBills, toggleTrack }
}
