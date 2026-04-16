'use client'

import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

/**
 * Tracks the most recent activity timestamp the user has seen, persisted in
 * `profiles.activity_last_seen_at`. Items with a timestamp greater than the
 * stored baseline are considered unread.
 *
 * The baseline is read once on mount and written back when the tab is hidden,
 * navigated away from, or this hook unmounts — never during the active session
 * — so the "new" highlight stays stable while the user is looking at the feed
 * and rolls forward to the latest timestamp once they leave.
 *
 * On a user's first ever visit (no stored baseline), nothing is flagged as new
 * to avoid a noisy first impression; the baseline gets seeded on leave.
 *
 * If the user is not signed in, nothing is highlighted and no writes happen.
 */
export function useActivitySeen(user: User | null, currentMaxTimestamp: number) {
  const userId = user?.id ?? null
  const [baseline, setBaseline] = useState<number | null>(null)
  const maxRef = useRef(currentMaxTimestamp)

  useEffect(() => {
    maxRef.current = currentMaxTimestamp
  }, [currentMaxTimestamp])

  useEffect(() => {
    if (!userId) {
      setBaseline(null)
      return
    }

    const supabase = createClient()
    let cancelled = false

    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('activity_last_seen_at')
        .eq('id', userId)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        console.error('[activity-seen] read failed:', error)
        return
      }
      const iso = data?.activity_last_seen_at as string | null | undefined
      setBaseline(iso ? new Date(iso).getTime() : null)
    })()

    const commit = () => {
      const ts = maxRef.current
      if (ts <= 0) return
      // Fire-and-forget: we intentionally don't await so the user can leave the
      // page without waiting on the network. The service role is not needed;
      // RLS restricts this to the authenticated user's own row.
      supabase
        .from('profiles')
        .update({ activity_last_seen_at: new Date(ts).toISOString() })
        .eq('id', userId)
        .then(({ error: updateError }) => {
          if (updateError) console.error('[activity-seen] write failed:', updateError)
        })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') commit()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', commit)

    return () => {
      cancelled = true
      commit()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', commit)
    }
  }, [userId])

  return {
    isNew: (timestamp: number) => baseline != null && timestamp > baseline,
  }
}
