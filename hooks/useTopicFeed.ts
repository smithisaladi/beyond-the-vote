'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { topicToSlug, type Topic } from '@/lib/topics'

export interface FeedItem {
  topic: Topic
  bill: { number: string; title: string; status: string }
}

export function useTopicFeed(topics: Topic[]): { feedItems: FeedItem[]; loading: boolean; error: string | null } {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable key so the effect only reruns when topic list actually changes
  const topicKey = useMemo(() => [...topics].sort().join(','), [topics])

  useEffect(() => {
    if (topics.length === 0) {
      setFeedItems([])
      return
    }

    let cancelled = false
    const supabase = createClient()
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const seen = new Set<string>()
        const results: FeedItem[] = []

        for (const topic of topics) {
          if (results.length >= 4) break
          const slug = topicToSlug(topic)
          const { data, error: rpcError } = await supabase.rpc('get_bills_by_topic', {
            topic_slug: slug,
            match_count: 4,
          })
          if (cancelled) return
          if (rpcError) throw rpcError
          for (const row of data ?? []) {
            if (results.length >= 4) break
            const num = row.bill_number ?? row.bill_id
            if (!seen.has(num)) {
              seen.add(num)
              results.push({
                topic,
                bill: { number: num, title: row.title, status: row.status ?? '' },
              })
            }
          }
        }

        setFeedItems(results)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load feed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey])

  return { feedItems, loading, error }
}
