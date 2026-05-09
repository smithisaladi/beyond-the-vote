import { useState, useCallback, useMemo } from 'react'
import { api } from '@/api/client'

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
      try {
        await api.del(`/api/politicians/${politicianId}/follow`)
      } catch {
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
