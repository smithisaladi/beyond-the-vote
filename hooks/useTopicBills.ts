'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { topicToSlug, type Topic } from '@/lib/topics'
import { queryKeys } from '@/lib/query-keys'

export type TopicFeedItem = {
  topic: Topic
  bill: { id: string; number: string; title: string; status: string }
}

export function useTopicBills(topics: Set<Topic>, perTopicLimit = 10): {
  items: TopicFeedItem[]
  loading: boolean
} {
  const topicKey = useMemo(() => Array.from(topics).sort().join(','), [topics])

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.topicBills(topicKey, perTopicLimit),
    queryFn: async () => {
      if (!topicKey) return []
      const topicList = topicKey.split(',') as Topic[]
      const results = await Promise.all(
        topicList.map(async (topic) => {
          try {
            const res = await fetch(
              `/api/bills/by-topic?slug=${topicToSlug(topic)}&limit=${perTopicLimit}`
            )
            if (!res.ok) return []
            const data = await res.json()
            return (data.bills ?? []).map((b: TopicFeedItem['bill']) => ({ topic, bill: b }))
          } catch {
            return []
          }
        })
      )
      const seen = new Set<string>()
      return (results.flat() as TopicFeedItem[]).filter((item) => {
        if (seen.has(item.bill.id)) return false
        seen.add(item.bill.id)
        return true
      })
    },
    enabled: !!topicKey,
    staleTime: 2 * 60 * 1000,
  })

  return { items: data ?? [], loading: isLoading }
}
