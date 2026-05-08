'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import type { Topic } from '@/lib/topics'

const LS_KEY = 'btb_topics'

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

export function useTopicPreferences(user: User | null) {
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
        const supabase = createClient()
        if (isSelected) {
          await supabase.from('topic_preferences').delete().eq('user_id', user.id).eq('topic', topic)
        } else {
          await supabase.from('topic_preferences').insert({ user_id: user.id, topic })
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
        const { error } = await createClient().from('topic_preferences').delete().eq('user_id', user.id)
        if (error) console.error('[topic-preferences] clearAll failed:', error)
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<Set<Topic>>(queryKey)
      queryClient.setQueryData<Set<Topic>>(queryKey, () => {
        const empty = new Set<Topic>()
        if (!user) {
          try { localStorage.removeItem(LS_KEY) } catch {}
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
