import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Topic } from '@/lib/topics'

const LS_KEY = 'btb_topics'

interface MinimalUser {
  id: string
}

function readLocalStorage(): Set<Topic> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return new Set(JSON.parse(raw) as Topic[])
  } catch (err) {
    console.error('[topic-preferences] parse LS failed:', err)
  }
  return new Set()
}

function writeLocalStorage(topics: Set<Topic>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...topics]))
  } catch (err) {
    console.error('[topic-preferences] setItem failed:', err)
  }
}

export function useTopicPreferences(user: MinimalUser | null) {
  const queryClient = useQueryClient()
  const queryKey = queryKeys.dashboard.topicPreferences(user?.id ?? null)

  const { data: selectedTopics = new Set<Topic>(), isFetched } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) return readLocalStorage()
      const res = await fetch('/api/dashboard/topic-preferences')
      if (!res.ok) return new Set<Topic>()
      const data = await res.json()
      return new Set<Topic>((data.topics ?? []) as Topic[])
    },
    staleTime: Infinity,
  })

  const toggleMutation = useMutation({
    mutationFn: async (topic: Topic) => {
      const isSelected = selectedTopics.has(topic)
      if (user) {
        if (isSelected) {
          await api.del(`/api/dashboard/topic-preferences/${encodeURIComponent(topic)}`)
        } else {
          await api.post('/api/dashboard/topic-preferences', { topic })
        }
      }
    },
    onMutate: async (topic: Topic) => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<Set<Topic>>(queryKey)
      queryClient.setQueryData<Set<Topic>>(queryKey, (old) => {
        const next = new Set(old)
        next.has(topic) ? next.delete(topic) : next.add(topic)
        if (!user) writeLocalStorage(next)
        return next
      })
      return { prev }
    },
    onError: (_err, _topic, context) => {
      if (context?.prev) queryClient.setQueryData(queryKey, context.prev)
    },
  })

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      if (user) {
        try {
          await api.del('/api/dashboard/topic-preferences')
        } catch (err) {
          console.error('[topic-preferences] clearAll failed:', err)
        }
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<Set<Topic>>(queryKey)
      queryClient.setQueryData<Set<Topic>>(queryKey, () => {
        const empty = new Set<Topic>()
        if (!user) {
          try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
        }
        return empty
      })
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(queryKey, context.prev)
    },
  })

  return {
    selectedTopics,
    toggle: (t: Topic) => toggleMutation.mutate(t),
    clearAll: () => clearAllMutation.mutate(),
    loaded: isFetched,
  }
}
