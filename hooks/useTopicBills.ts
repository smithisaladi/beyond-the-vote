'use client'

import { useState, useEffect, useMemo } from 'react'
import { topicToSlug, type Topic } from '@/lib/topics'

export type TopicFeedItem = {
  topic: Topic
  bill: { id: string; number: string; title: string; status: string }
}

export function useTopicBills(topics: Set<Topic>, perTopicLimit = 10): {
  items: TopicFeedItem[]
  loading: boolean
} {
  const [items, setItems] = useState<TopicFeedItem[]>([])
  const [loading, setLoading] = useState(false)

  // Stable key — Set reference changes every render from useTopicPreferences
  const topicKey = useMemo(() => Array.from(topics).sort().join(','), [topics])

  useEffect(() => {
    if (!topicKey) { setItems([]); return }

    setLoading(true)
    const topicList = topicKey.split(',') as Topic[]

    const fetches = topicList.map(async (topic) => {
      try {
        const res = await fetch(`/api/bills/by-topic?slug=${topicToSlug(topic)}&limit=${perTopicLimit}`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.bills ?? []).map((b: TopicFeedItem['bill']) => ({ topic, bill: b }))
      } catch {
        return []
      }
    })

    Promise.all(fetches).then((results) => {
      const seen = new Set<string>()
      const merged = (results.flat() as TopicFeedItem[]).filter((item) => {
        if (seen.has(item.bill.id)) return false
        seen.add(item.bill.id)
        return true
      })
      setItems(merged)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey, perTopicLimit])

  return { items, loading }
}
