'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { topicToSlug, type Topic } from '@/lib/topics'

export interface FeedItem {
  topic: Topic
  bill: { number: string; title: string; status: string }
}

export function useTopicFeed(topics: Topic[]): FeedItem[] {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])

  useEffect(() => {
    if (topics.length === 0) {
      setFeedItems([])
      return
    }

    let cancelled = false
    const supabase = createClient()

    async function load() {
      const seen = new Set<string>()
      const results: FeedItem[] = []

      for (const topic of topics) {
        if (results.length >= 4) break
        const slug = topicToSlug(topic)
        const { data } = await supabase.rpc('get_bills_by_topic', {
          topic_slug: slug,
          match_count: 4,
        })
        if (cancelled) return
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
    }

    load()
    return () => { cancelled = true }
  }, [topics.join(',')])

  return feedItems
}
