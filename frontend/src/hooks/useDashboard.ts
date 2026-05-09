
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTopicPreferences } from '@/hooks/useTopicPreferences'
import { useTopicBills, type TopicFeedItem } from '@/hooks/useTopicBills'
import { useTrackedBills } from '@/hooks/useTrackedBills'
import { queryKeys } from '@/lib/query-keys'
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

export function useDashboard(user: { id: string } | null): {
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

  const followedQuery = useQuery({
    queryKey: queryKeys.dashboard.followed(user?.id ?? ''),
    queryFn: async () => {
      const res = await fetch('/api/dashboard/followed')
      if (!res.ok) return []
      const { politicians } = await res.json()
      return (politicians ?? []) as FollowedPolitician[]
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  })

  const trackedBillsKey = useMemo(
    () => Array.from(trackedBills).sort().join(','),
    [trackedBills]
  )

  const trackedBillDetailsQuery = useQuery({
    queryKey: queryKeys.dashboard.trackedBills(user?.id ?? ''),
    queryFn: async () => {
      const res = await fetch('/api/dashboard/tracked-bills')
      if (!res.ok) return []
      const { bills } = await res.json()
      return (bills ?? []) as TrackedBill[]
    },
    enabled: !!user && trackedBillsKey !== '',
    staleTime: 60 * 1000,
  })

  const followedPoliticians = followedQuery.data ?? []
  const trackedBillDetails = trackedBillDetailsQuery.data ?? []
  const followedTopics = Array.from(selectedTopics) as Topic[]
  const topicFeedItems = topicBills.slice(0, 6)

  const activity = useMemo(() => {
    const items: ActivityItem[] = []

    for (const p of followedPoliticians) {
      if (p.latestVote) {
        items.push({
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

    for (const b of trackedBillDetails) {
      if (b.lastAction) {
        items.push({
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

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)
  }, [followedPoliticians, trackedBillDetails])

  const loading = followedQuery.isLoading || trackedBillDetailsQuery.isLoading

  return {
    followedPoliticians,
    trackedBillDetails,
    topicFeedItems,
    followedTopics,
    activity,
    loading,
  }
}
