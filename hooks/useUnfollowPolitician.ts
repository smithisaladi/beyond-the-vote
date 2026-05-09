'use client'

import { useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

interface FollowedPolitician {
  id: string
  [key: string]: unknown
}

export function useUnfollowPolitician(userId: string | undefined) {
  const [unfollowing, setUnfollowing] = useState<Set<string>>(new Set())

  const handleUnfollow = useCallback(
    async (politicianId: string) => {
      if (!userId || unfollowing.has(politicianId)) return
      setUnfollowing(prev => new Set([...prev, politicianId]))
      const supabase = createClient()
      const { error } = await supabase
        .from('followed_politicians')
        .delete()
        .eq('user_id', userId)
        .eq('politician_id', politicianId)
      if (error) {
        setUnfollowing(prev => {
          const next = new Set(prev)
          next.delete(politicianId)
          return next
        })
      }
    },
    [userId, unfollowing],
  )

  const filterUnfollowed = useCallback(
    <T extends FollowedPolitician>(politicians: T[]): T[] =>
      politicians.filter(p => !unfollowing.has(p.id)),
    [unfollowing],
  )

  return useMemo(
    () => ({ unfollowing, handleUnfollow, filterUnfollowed }),
    [unfollowing, handleUnfollow, filterUnfollowed],
  )
}
