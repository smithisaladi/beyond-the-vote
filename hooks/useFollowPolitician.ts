'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useFollowPolitician(
  politicianId: string,
  userId: string | null,
  onSignInRequired: () => void,
) {
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) { setFollowing(false); return }
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      try {
        const { data, error: err } = await supabase
          .from('followed_politicians')
          .select('politician_id')
          .eq('user_id', userId)
          .eq('politician_id', politicianId)
          .maybeSingle()
        if (cancelled) return
        if (err) setError(err.message)
        else setFollowing(!!data)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load follow state')
        console.error('[follow-politician] read failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [userId, politicianId])

  const toggleFollow = async () => {
    if (!userId) {
      onSignInRequired()
      return
    }

    const supabase = createClient()
    const next = !following
    setFollowing(next) // optimistic
    setLoading(true)
    setError(null)

    const { error: err } = next
      ? await supabase.from('followed_politicians').insert({ user_id: userId, politician_id: politicianId })
      : await supabase.from('followed_politicians').delete().eq('user_id', userId).eq('politician_id', politicianId)

    if (err) {
      setFollowing(!next) // revert on failure
      setError(err.message)
    }
    setLoading(false)
  }

  return { following, loading, error, toggleFollow }
}
