import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { api } from '@/api/client'

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
      const data = await api.get<{ following: boolean }>(
        `/api/politicians/${politicianId}/follow`
      )
      return data.following
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  })

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: async () => {
      if (!userId) return
      const next = !following
      if (next) {
        await api.post(`/api/politicians/${politicianId}/follow`)
      } else {
        await api.del(`/api/politicians/${politicianId}/follow`)
      }
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
