'use client'

import { useState, useEffect, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { useTopicPreferences } from '@/hooks/useTopicPreferences'
import { useTopicBills, type TopicFeedItem } from '@/hooks/useTopicBills'
import { useTrackedBills } from '@/hooks/useTrackedBills'
import type { Party, BillStatus } from '@/lib/types'
import type { Topic } from '@/lib/topics'

export type FollowedPolitician = {
  id: string
  name: string
  title: string
  party: Party
  state: string
  photo?: string | null
  district?: string | null
  latestVote: { bill: string; billId: string; billTitle: string; date: string; vote: 'Yea' | 'Nay'; question: string } | null
}

export type TrackedBill = {
  id: string
  number: string
  title: string
  status: BillStatus
  lastAction: string
  lastActionText: string
  category: string
}

export type ActivityItem = {
  id: string
  politician: string | null
  action: string
  subject: string
  date: string
  timestamp: number
  isAlert: boolean
  href: string | null
}

function mergeActivity(prev: ActivityItem[], next: ActivityItem[]): ActivityItem[] {
  const ids = new Set(prev.map(a => a.id))
  return [...prev, ...next.filter(a => !ids.has(a.id))]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10)
}

export function useDashboard(user: User | null): {
  followedPoliticians: FollowedPolitician[]
  trackedBillDetails: TrackedBill[]
  topicFeedItems: TopicFeedItem[]
  followedTopics: Topic[]
  activity: ActivityItem[]
  loading: boolean
} {
  const { selectedTopics } = useTopicPreferences(user)
  const { items: topicBills } = useTopicBills(selectedTopics, 2)
  const { trackedBills } = useTrackedBills(user?.id ?? null)

  const [followedPoliticians, setFollowedPoliticians] = useState<FollowedPolitician[]>([])
  const [trackedBillDetails, setTrackedBillDetails] = useState<TrackedBill[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  // Stable key derived from trackedBills Set to avoid reference-inequality re-renders
  const trackedBillsKey = useMemo(() => Array.from(trackedBills).sort().join(','), [trackedBills])

  // Derive followedTopics array and capped feed items
  const followedTopics = Array.from(selectedTopics) as Topic[]
  const topicFeedItems = topicBills.slice(0, 6)

  // Fetch followed politicians and tracked bills in a single effect
  useEffect(() => {
    if (!user) {
      setFollowedPoliticians([])
      setTrackedBillDetails([])
      setLoading(false)
      setActivity([])
      return
    }

    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)

    async function load() {
      const [followedResult, trackedResult] = await Promise.allSettled([
        fetch('/api/dashboard/followed', { signal }),
        trackedBillsKey !== ''
          ? fetch('/api/dashboard/tracked-bills', { signal })
          : Promise.resolve(null),
      ])

      if (signal.aborted) return

      const allActivity: ActivityItem[] = []

      // Process followed politicians
      if (followedResult.status === 'fulfilled' && followedResult.value?.ok) {
        const { politicians } = await followedResult.value.json()
        const pols: FollowedPolitician[] = politicians ?? []

        for (const p of pols) {
          if (p.latestVote) {
            allActivity.push({
              id: `vote-${p.id}`,
              politician: p.name,
              action: p.latestVote.question
                ? `voted ${p.latestVote.vote} on ${p.latestVote.question.replace(/^On /i, '')}`
                : `voted ${p.latestVote.vote}`,
              subject: p.latestVote.billTitle || '',
              date: p.latestVote.date,
              timestamp: p.latestVote.date ? new Date(p.latestVote.date).getTime() || 0 : 0,
              isAlert: false,
              href: p.latestVote.billId ? `/bills/${p.latestVote.billId}` : `/representatives/${p.id}`,
            })
          }
        }

        if (!signal.aborted) setFollowedPoliticians(pols)
      }

      // Process tracked bills
      if (
        trackedResult.status === 'fulfilled' &&
        trackedResult.value !== null &&
        trackedResult.value.ok
      ) {
        const { bills } = await trackedResult.value.json()
        const trackedList: TrackedBill[] = bills ?? []

        for (const b of trackedList) {
          if (b.lastAction) {
            allActivity.push({
              id: `bill-${b.id}`,
              politician: null,
              action: b.lastActionText || 'Updated',
              subject: b.title,
              date: b.lastAction,
              timestamp: b.lastAction ? new Date(b.lastAction).getTime() || 0 : 0,
              isAlert: b.status === 'Stalled' || b.status === 'Failed',
              href: `/bills/${b.id}`,
            })
          }
        }

        if (!signal.aborted) setTrackedBillDetails(trackedList)
      } else if (!signal.aborted && trackedBillsKey === '') {
        setTrackedBillDetails([])
      }

      // Merge all activity at once
      if (!signal.aborted) {
        setActivity(prev => mergeActivity(prev, allActivity))
        setLoading(false)
      }
    }

    load().catch(err => console.error('[dashboard] load failed:', err))
    return () => controller.abort()
  }, [user, trackedBillsKey])

  return {
    followedPoliticians,
    trackedBillDetails,
    topicFeedItems,
    followedTopics,
    activity,
    loading,
  }
}
