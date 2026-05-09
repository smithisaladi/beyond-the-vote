import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'

/**
 * Tracks the most recent activity timestamp the user has seen, persisted via
 * the backend API. Items with a timestamp greater than the stored baseline are
 * considered unread.
 *
 * The baseline is read once on mount and written back when the tab is hidden,
 * navigated away from, or this hook unmounts -- never during the active session
 * -- so the "new" highlight stays stable while the user is looking at the feed
 * and rolls forward to the latest timestamp once they leave.
 *
 * On a user's first ever visit (no stored baseline), nothing is flagged as new
 * to avoid a noisy first impression; the baseline gets seeded on leave.
 *
 * If the user is not signed in, nothing is highlighted and no writes happen.
 */
export function useActivitySeen(userId: string | null, currentMaxTimestamp: number) {
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

    let cancelled = false

    ;(async () => {
      try {
        const data = await api.get<{ activityLastSeenAt: string | null }>('/api/dashboard/activity-seen')
        if (cancelled) return
        const iso = data.activityLastSeenAt
        setBaseline(iso ? new Date(iso).getTime() : null)
      } catch {
        if (!cancelled) console.error('[activity-seen] read failed')
      }
    })()

    let committed = false
    const commit = () => {
      if (committed) return
      const ts = maxRef.current
      if (ts <= 0) return
      committed = true
      api
        .put('/api/dashboard/activity-seen', { timestamp: new Date(ts).toISOString() })
        .catch((err: unknown) => console.error('[activity-seen] write failed:', err))
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
