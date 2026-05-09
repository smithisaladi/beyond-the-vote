import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { api } from '@/api/client'

export function useTrackedBills(userId: string | null) {
  const queryClient = useQueryClient()
  const queryKey = queryKeys.dashboard.trackedBillIds(userId ?? '')

  const { data: trackedBills = new Set<string>(), isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch('/api/dashboard/tracked-bills')
      if (!res.ok) throw new Error('Failed to load tracked bills')
      const { bills } = await res.json()
      return new Set<string>((bills ?? []).map((b: { id: string }) => b.id))
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  })

  const { mutate: toggleTrack, error: mutError } = useMutation({
    mutationFn: async (billId: string) => {
      if (!userId) return
      const isTracked = trackedBills.has(billId)
      if (isTracked) {
        await api.del(`/api/dashboard/tracked-bills/${billId}`)
      } else {
        await api.post('/api/dashboard/tracked-bills', { billId })
      }
    },
    onMutate: async (billId: string) => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<Set<string>>(queryKey)
      queryClient.setQueryData<Set<string>>(queryKey, (old) => {
        const next = new Set(old)
        next.has(billId) ? next.delete(billId) : next.add(billId)
        return next
      })
      return { prev }
    },
    onError: (_err, _billId, context) => {
      if (context?.prev) queryClient.setQueryData(queryKey, context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  return {
    trackedBills,
    toggleTrack,
    loading: isLoading,
    error: mutError?.message ?? null,
  }
}
