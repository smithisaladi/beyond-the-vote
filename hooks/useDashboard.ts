'use client'

import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
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
  latestVote: { bill: string; date: string; vote: 'Yea' | 'Nay' } | null
}

export type TrackedBill = {
  id: string
  number: string
  title: string
  status: BillStatus
  lastAction: string
  category: string
}

export type ActivityItem = {
  id: string
  politician: string | null
  action: string
  subject: string
  date: string
  isAlert: boolean
  href: string | null
}

function mergeActivity(prev: ActivityItem[], next: ActivityItem[]): ActivityItem[] {
  const ids = new Set(prev.map(a => a.id))
  return [...prev, ...next.filter(a => !ids.has(a.id))].slice(0, 10)
}

export function useDashboard(user: User | null): {
  followedPoliticians: FollowedPolitician[]
  trackedBillDetails: TrackedBill[]
  topicFeedItems: TopicFeedItem[]
  followedTopics: Topic[]
  activity: ActivityItem[]
  loading: { politicians: boolean; bills: boolean }
} {
  const { selectedTopics } = useTopicPreferences(user)
  const { items: topicBills } = useTopicBills(selectedTopics, 2)
  const { trackedBills } = useTrackedBills(user?.id ?? null)

  const [followedPoliticians, setFollowedPoliticians] = useState<FollowedPolitician[]>([])
  const [trackedBillDetails, setTrackedBillDetails] = useState<TrackedBill[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loadingPoliticians, setLoadingPoliticians] = useState(true)
  const [loadingBills, setLoadingBills] = useState(true)

  // Derive followedTopics array and capped feed items
  const followedTopics = Array.from(selectedTopics) as Topic[]
  const topicFeedItems = topicBills.slice(0, 6)

  // Fetch followed politicians + their details
  useEffect(() => {
    if (!user) {
      setFollowedPoliticians([])
      setLoadingPoliticians(false)
      return
    }

    let cancelled = false
    setLoadingPoliticians(true)

    async function load() {
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('followed_politicians')
        .select('politician_id')
        .eq('user_id', user!.id)

      if (!rows || rows.length === 0) {
        if (!cancelled) { setFollowedPoliticians([]); setLoadingPoliticians(false) }
        return
      }

      const results = await Promise.allSettled(
        rows.map((r: { politician_id: string }) =>
          fetch(`/api/politicians/${r.politician_id}`).then(res => res.ok ? res.json() : null)
        )
      )

      if (cancelled) return

      const pols: FollowedPolitician[] = []
      const newActivity: ActivityItem[] = []

      results.forEach((result) => {
        if (result.status !== 'fulfilled' || !result.value?.politician) return
        const p = result.value.politician
        const latestVote = p.votes?.[0] ?? null
        pols.push({
          id: p.id,
          name: p.name,
          title: p.title,
          party: p.party,
          state: p.state,
          photo: p.photo ?? null,
          district: p.district ?? null,
          latestVote: latestVote
            ? { bill: latestVote.bill, date: latestVote.date, vote: latestVote.vote }
            : null,
        })
        if (latestVote) {
          newActivity.push({
            id: `vote-${p.id}`,
            politician: p.name,
            action: `voted ${latestVote.vote} on`,
            subject: latestVote.bill,
            date: latestVote.date,
            isAlert: false,
            href: `/representatives/${p.id}`,
          })
        }
      })

      setFollowedPoliticians(pols)
      setActivity(prev => mergeActivity(prev, newActivity))
      setLoadingPoliticians(false)
    }

    load()
    return () => { cancelled = true }
  }, [user])

  // Fetch full bill details for tracked bill IDs
  useEffect(() => {
    if (!user) {
      setTrackedBillDetails([])
      setLoadingBills(false)
      return
    }
    if (trackedBills.size === 0) {
      setTrackedBillDetails([])
      setLoadingBills(false)
      return
    }

    let cancelled = false
    setLoadingBills(true)

    async function load() {
      const results = await Promise.allSettled(
        Array.from(trackedBills).map(id =>
          fetch(`/api/bills/${id}`).then(res => res.ok ? res.json() : null)
        )
      )

      if (cancelled) return

      const bills: TrackedBill[] = []
      const newActivity: ActivityItem[] = []

      results.forEach((result) => {
        if (result.status !== 'fulfilled' || !result.value?.bill) return
        const b = result.value.bill
        const lastActionDate = b.actions?.[0]?.date
          ? new Date(b.actions[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : ''
        bills.push({
          id: b.id,
          number: b.number,
          title: b.title,
          status: b.status,
          lastAction: lastActionDate,
          category: b.policyArea ?? '',
        })
        if (b.actions?.[0]) {
          newActivity.push({
            id: `bill-${b.id}`,
            politician: null,
            action: b.actions[0].text,
            subject: b.title,
            date: lastActionDate,
            isAlert: b.status === 'Stalled' || b.status === 'Failed',
            href: `/bills/${b.id}`,
          })
        }
      })

      setTrackedBillDetails(bills)
      setActivity(prev => mergeActivity(prev, newActivity))
      setLoadingBills(false)
    }

    load()
    return () => { cancelled = true }
  }, [user, trackedBills])

  return {
    followedPoliticians,
    trackedBillDetails,
    topicFeedItems,
    followedTopics,
    activity,
    loading: { politicians: loadingPoliticians, bills: loadingBills },
  }
}
