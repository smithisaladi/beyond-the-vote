'use client'

import { useState, useEffect, useMemo } from 'react'
import { topicToSlug, type Topic } from '@/lib/topics'

export interface FeedItem {
  topic: Topic
  bill: { number: string; title: string; status: string }
}

type ByTopicBill = {
  id: string
  number: string
  title: string
  status: string
  topics: string[]
  summary: string | null
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
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const seen = new Set<string>()
        const results: FeedItem[] = []

        for (const topic of topics) {
          if (results.length >= 4) break
          const slug = topicToSlug(topic)
          const resp = await fetch(
            `/api/bills/by-topic?slug=${encodeURIComponent(slug)}&limit=4`,
            { signal: controller.signal },
          )
          if (cancelled) return
          if (!resp.ok) throw new Error(`by-topic fetch failed: ${resp.status}`)
          const { bills } = (await resp.json()) as { bills: ByTopicBill[] }
          for (const row of bills) {
            if (results.length >= 4) break
            const num = row.number
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
        if (cancelled) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load feed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      controller.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey])

  return { feedItems, loading, error }
}
