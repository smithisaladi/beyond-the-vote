'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useFollowPolitician(
  politicianId: string,
  userId: string | null,
  onSignInRequired: () => void,
) {
  const [following, setFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  useEffect(() => {
    if (!userId) { setFollowing(false); return }
    const supabase = createClient()
    supabase
      .from('followed_politicians')
      .select('politician_id')
      .eq('user_id', userId)
      .eq('politician_id', politicianId)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data))
  }, [userId, politicianId])

  const toggleFollow = async () => {
    if (!userId) {
      onSignInRequired()
      return
    }

    const supabase = createClient()
    const next = !following
    setFollowing(next) // optimistic
    setFollowLoading(true)

    const { error } = next
      ? await supabase.from('followed_politicians').insert({ user_id: userId, politician_id: politicianId })
      : await supabase.from('followed_politicians').delete().eq('user_id', userId).eq('politician_id', politicianId)

    if (error) setFollowing(!next) // revert on failure
    setFollowLoading(false)
  }

  return { following, followLoading, toggleFollow }
}
