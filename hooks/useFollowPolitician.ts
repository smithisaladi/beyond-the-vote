'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'

export function useFollowPolitician(
  politicianId: string,
  userId: string | null,
  onSignInRequired: () => void,
) {
  const queryClient = useQueryClient()
  const queryKey = queryKeys.politicians.follow(politicianId, userId ?? '')

  const { data: following = false } = useQuery({
    queryKey,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('followed_politicians')
        .select('politician_id')
        .eq('user_id', userId!)
        .eq('politician_id', politicianId)
        .maybeSingle()
      if (error) throw error
      return !!data
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  })

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: async () => {
      if (!userId) return
      const supabase = createClient()
      const next = !following
      const { error } = next
        ? await supabase.from('followed_politicians').insert({ user_id: userId, politician_id: politicianId })
        : await supabase.from('followed_politicians').delete().eq('user_id', userId).eq('politician_id', politicianId)
      if (error) throw error
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<boolean>(queryKey)
      queryClient.setQueryData<boolean>(queryKey, (old) => !old)
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) queryClient.setQueryData(queryKey, context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
      // Also invalidate the dashboard followed list so it stays in sync
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'followed'] })
    },
  })

  const toggleFollow = () => {
    if (!userId) {
      onSignInRequired()
      return
    }
    toggle()
  }

  return {
    following,
    loading: isPending,
    error: null as string | null,
    toggleFollow,
  }
}
