'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ALL_TOPICS, topicToSlug, type Topic } from '@/lib/topics'
import type { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const LS_KEY = 'btb_topics'

type Party = 'Democrat' | 'Republican' | 'Independent'
type BillStatus = 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'

const PARTY_STYLES: Record<Party, { bg: string; text: string }> = {
  Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
}

const STATUS_STYLES: Record<BillStatus, { bg: string; text: string }> = {
  Active:    { bg: 'bg-[#9B7FA6]/[0.12]', text: 'text-[#9B7FA6]' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
  Passed:    { bg: 'bg-[#6A9B7B]/[0.12]', text: 'text-[#6A9B7B]' },
  Failed:    { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
}

type FollowedPolitician = {
  id: string
  name: string
  title: string
  party: Party
  state: string
  latestVote: { bill: string; date: string; vote: 'Yea' | 'Nay' } | null
}

type TrackedBill = {
  id: string
  number: string
  title: string
  status: BillStatus
  lastAction: string
  category: string
}

type ActivityItem = {
  id: string
  politician: string | null
  action: string
  subject: string
  date: string
  isAlert: boolean
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0][0]
  return (
    <div className="w-11 h-11 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
      <span className="text-sm text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

function IconBell() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}

type TopicFeedItem = {
  topic: Topic
  bill: { id: string; number: string; title: string; status: string }
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-[#D6CFC4] p-5 animate-pulse">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-[#E8E3DA] flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 bg-[#E8E3DA] rounded w-3/4" />
          <div className="h-3 bg-[#E8E3DA] rounded w-1/2" />
        </div>
      </div>
      <div className="h-3 bg-[#E8E3DA] rounded w-1/4 mb-4" />
      <div className="border-t border-[rgba(28,28,26,0.06)] pt-3.5 space-y-2">
        <div className="h-2.5 bg-[#E8E3DA] rounded w-1/3" />
        <div className="h-3 bg-[#E8E3DA] rounded w-full" />
      </div>
    </div>
  )
}

function EmptyState({ message, href, linkLabel }: { message: string; href: string; linkLabel: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#D6CFC4] px-6 py-10 text-center">
      <p className="text-sm text-[#1C1C1A]/45 mb-3">{message}</p>
      <Link href={href} className="text-sm text-[#9B7FA6] hover:underline underline-offset-2">
        {linkLabel}
      </Link>
    </div>
  )
}

function getInitials(user: User): string {
  const name = user.user_metadata?.full_name as string | undefined
  if (name) {
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0][0].toUpperCase()
  }
  return (user.email?.[0] ?? '?').toUpperCase()
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [followedTopics, setFollowedTopics] = useState<Topic[]>([])
  const [politicians, setPoliticians] = useState<FollowedPolitician[]>([])
  const [trackedBills, setTrackedBills] = useState<TrackedBill[]>([])
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([])
  const [topicFeedItems, setTopicFeedItems] = useState<TopicFeedItem[]>([])
  const [loadingPoliticians, setLoadingPoliticians] = useState(true)
  const [loadingBills, setLoadingBills] = useState(true)

  // Auth state
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load followed topics
  useEffect(() => {
    async function load() {
      if (user) {
        const supabase = createClient()
        const { data } = await supabase
          .from('topic_preferences')
          .select('topic')
          .eq('user_id', user.id)
        if (data) {
          const topics = data
            .map((r: { topic: string }) => r.topic)
            .filter((t: string) => ALL_TOPICS.includes(t as Topic)) as Topic[]
          setFollowedTopics(topics)
        }
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY)
          if (raw) {
            const saved = (JSON.parse(raw) as string[]).filter(t => ALL_TOPICS.includes(t as Topic)) as Topic[]
            setFollowedTopics(saved)
          }
        } catch {}
      }
    }
    load()
  }, [user])

  // Fetch bills for followed topics
  useEffect(() => {
    if (followedTopics.length === 0) { setTopicFeedItems([]); return }
    const fetches = followedTopics.map(async (topic) => {
      const url = `/api/bills/by-topic?slug=${topicToSlug(topic)}&limit=2`
      try {
        const res = await fetch(url)
        if (!res.ok) return []
        const data = await res.json()
        return (data.bills ?? []).map((b: TopicFeedItem['bill']) => ({ topic, bill: b }))
      } catch { return [] }
    })
    Promise.all(fetches).then(results => {
      const seen = new Set<string>()
      const merged = (results.flat() as TopicFeedItem[]).filter(item => {
        if (seen.has(item.bill.id)) return false
        seen.add(item.bill.id)
        return true
      }).slice(0, 6)
      setTopicFeedItems(merged)
    })
  }, [followedTopics])

  // Load followed politicians
  useEffect(() => {
    if (!user) { setLoadingPoliticians(false); return }

    async function load() {
      setLoadingPoliticians(true)
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('followed_politicians')
        .select('politician_id')
        .eq('user_id', user!.id)

      if (!rows || rows.length === 0) {
        setPoliticians([])
        setLoadingPoliticians(false)
        return
      }

      const results = await Promise.allSettled(
        rows.map((r: { politician_id: string }) =>
          fetch(`/api/politicians/${r.politician_id}`).then(res => res.ok ? res.json() : null)
        )
      )

      const pols: FollowedPolitician[] = []
      const activity: ActivityItem[] = []

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
          latestVote: latestVote
            ? { bill: latestVote.bill, date: latestVote.date, vote: latestVote.vote }
            : null,
        })
        if (latestVote) {
          activity.push({
            id: `vote-${p.id}`,
            politician: p.name,
            action: `voted ${latestVote.vote} on`,
            subject: latestVote.bill,
            date: latestVote.date,
            isAlert: false,
          })
        }
      })

      setPoliticians(pols)
      setActivityFeed(prev => mergeActivity(prev, activity))
      setLoadingPoliticians(false)
    }

    load()
  }, [user])

  // Load tracked bills
  useEffect(() => {
    if (!user) { setLoadingBills(false); return }

    async function load() {
      setLoadingBills(true)
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('tracked_bills')
        .select('bill_id')
        .eq('user_id', user!.id)

      if (!rows || rows.length === 0) {
        setTrackedBills([])
        setLoadingBills(false)
        return
      }

      const results = await Promise.allSettled(
        rows.map((r: { bill_id: string }) =>
          fetch(`/api/bills/${r.bill_id}`).then(res => res.ok ? res.json() : null)
        )
      )

      const bills: TrackedBill[] = []
      const activity: ActivityItem[] = []

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
          activity.push({
            id: `bill-${b.id}`,
            politician: null,
            action: b.actions[0].text,
            subject: b.title,
            date: lastActionDate,
            isAlert: b.status === 'Stalled' || b.status === 'Failed',
          })
        }
      })

      setTrackedBills(bills)
      setActivityFeed(prev => mergeActivity(prev, activity))
      setLoadingBills(false)
    }

    load()
  }, [user])

  return (
    <div className="flex-1 flex flex-col min-h-screen">

        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Dashboard</h1>
          </div>

          <div className="flex items-center gap-5">
            <button
              className="relative text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70 transition-colors"
              aria-label="Notifications"
            >
              <IconBell />
            </button>

            {user && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#9B7FA6]/20 border border-[#9B7FA6]/30 flex items-center justify-center">
                  <span className="text-xs font-semibold text-[#9B7FA6]" style={{ fontFamily: 'var(--font-serif)' }}>
                    {getInitials(user)}
                  </span>
                </div>
                <span className="text-sm text-[#1C1C1A]/60 hidden sm:inline">
                  {user.user_metadata?.full_name ?? user.email}
                </span>
              </div>
            )}

            <button
              onClick={async () => {
                await createClient().auth.signOut()
                router.push('/')
                router.refresh()
              }}
              aria-label="Sign out"
              className="flex items-center gap-2 text-sm text-[#1C1C1A]/45 hover:text-[#1C1C1A]/75 transition-colors"
            >
              <span className="hidden sm:inline">Sign out</span>
              <SignOutIcon />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-8">
          <div className="max-w-5xl">

            {/* ── Following politicians ── */}
            <section className="mb-10">
              <div className="flex items-baseline gap-2.5 mb-5">
                <h2 className="text-base text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Following</h2>
                {!loadingPoliticians && (
                  <span className="text-sm text-[#1C1C1A]/38">{politicians.length} politicians</span>
                )}
              </div>

              {loadingPoliticians ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              ) : politicians.length === 0 ? (
                <EmptyState
                  message="You haven't followed any politicians yet."
                  href="/representatives"
                  linkLabel="Find your representatives →"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {politicians.map((pol) => {
                    const badge = PARTY_STYLES[pol.party]
                    return (
                      <Link key={pol.id} href={`/representatives/${pol.id}`} className="group">
                        <div className="bg-white rounded-xl border border-[#D6CFC4] p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow h-full">

                          <div className="flex items-start gap-3">
                            <Initials name={pol.name} />
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-sm font-medium text-[#1C1C1A] truncate group-hover:text-[#9B7FA6] transition-colors"
                                style={{ fontFamily: 'var(--font-serif)' }}
                              >
                                {pol.name}
                              </p>
                              <p className="text-xs text-[#1C1C1A]/50 truncate mt-0.5">{pol.title}</p>
                              <p className="text-xs text-[#1C1C1A]/38">{pol.state}</p>
                            </div>
                          </div>

                          <span className={`self-start text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                            {pol.party}
                          </span>

                          {pol.latestVote && (
                            <div className="border-t border-[rgba(28,28,26,0.06)] pt-3.5">
                              <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-2">Latest vote</p>
                              <div className="flex items-start gap-2">
                                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 leading-tight ${
                                  pol.latestVote.vote === 'Yea'
                                    ? 'bg-[#9B7FA6]/[0.12] text-[#9B7FA6]'
                                    : 'bg-[#B85C38]/[0.12] text-[#B85C38]'
                                }`}>
                                  {pol.latestVote.vote}
                                </span>
                                <p className="text-xs text-[#1C1C1A]/65 leading-snug">{pol.latestVote.bill}</p>
                              </div>
                              <p className="text-[11px] text-[#1C1C1A]/32 mt-2">{pol.latestVote.date}</p>
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>

            {/* ── Personalized topic feed ── */}
            {topicFeedItems.length > 0 && (
              <section className="mb-10">
                <div className="flex items-baseline justify-between mb-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-base text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Your Topics</h2>
                    <span className="text-sm text-[#1C1C1A]/38">{followedTopics.length} followed</span>
                  </div>
                  <Link href="/topics" className="text-xs text-[#9B7FA6] hover:underline underline-offset-2">
                    Manage topics →
                  </Link>
                </div>

                <div className="flex flex-wrap gap-2 mb-5">
                  {followedTopics.map(t => (
                    <Link
                      key={t}
                      href={`/topics/${topicToSlug(t)}`}
                      className="text-xs font-medium px-3 py-1 rounded-full bg-[#9B7FA6]/10 text-[#9B7FA6] hover:bg-[#9B7FA6]/18 transition-colors"
                    >
                      {t}
                    </Link>
                  ))}
                </div>

                <div className="bg-white rounded-xl border border-[#D6CFC4] divide-y divide-[rgba(28,28,26,0.05)]">
                  {topicFeedItems.map(({ topic, bill }, i) => {
                    const s = STATUS_STYLES[bill.status as BillStatus] ?? STATUS_STYLES['Active']
                    return (
                      <Link key={i} href={`/bills/${bill.id}`} className="block px-6 py-4 hover:bg-[#F5F0E8]/60 transition-colors group">
                        <div className="flex items-center gap-1.5 mb-2">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9B7FA6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                            <line x1="7" y1="7" x2="7.01" y2="7" />
                          </svg>
                          <span className="text-[10px] text-[#9B7FA6] font-medium">Because you follow {topic}</span>
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[11px] font-mono text-[#1C1C1A]/38 mb-1">{bill.number}</p>
                            <p className="text-sm text-[#1C1C1A] leading-snug group-hover:text-[#9B7FA6] transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>
                              {bill.title}
                            </p>
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
                            {bill.status}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ── Lower two-column ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-6">

              {/* Activity feed */}
              <section>
                <div className="flex items-baseline gap-2.5 mb-5">
                  <h2 className="text-base text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Activity</h2>
                  <span className="text-sm text-[#1C1C1A]/38">Recent updates</span>
                </div>

                {loadingPoliticians && loadingBills ? (
                  <div className="bg-white rounded-xl border border-[#D6CFC4] p-6 animate-pulse space-y-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="flex gap-4">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#E8E3DA] mt-2 flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-[#E8E3DA] rounded w-5/6" />
                          <div className="h-3 bg-[#E8E3DA] rounded w-1/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activityFeed.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[#D6CFC4] px-6 py-10 text-center">
                    <p className="text-sm text-[#1C1C1A]/45">No activity yet — follow politicians and track bills to see updates here.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-[#D6CFC4] overflow-hidden">
                    {activityFeed.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-4 px-6 py-4 ${
                          idx < activityFeed.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0 ${item.isAlert ? 'bg-[#B85C38]' : 'bg-[#9B7FA6]/50'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#1C1C1A]/70 leading-snug">
                            {item.politician && (
                              <span className="text-[#1C1C1A] font-medium">{item.politician} </span>
                            )}
                            <span className="text-[#1C1C1A]/45">{item.action} </span>
                            <span className="text-[#1C1C1A]/80">{item.subject}</span>
                          </p>
                        </div>
                        <span className="text-[11px] text-[#1C1C1A]/32 flex-shrink-0 mt-0.5 whitespace-nowrap">{item.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Tracked bills */}
              <section>
                <div className="flex items-baseline justify-between mb-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-base text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Tracked Bills</h2>
                    {!loadingBills && <span className="text-sm text-[#1C1C1A]/38">{trackedBills.length}</span>}
                  </div>
                  <Link href="/bills" className="text-xs text-[#9B7FA6] hover:underline underline-offset-2">View all</Link>
                </div>

                {loadingBills ? (
                  <div className="bg-white rounded-xl border border-[#D6CFC4] p-5 animate-pulse space-y-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="space-y-2 pb-4 border-b border-[rgba(28,28,26,0.05)] last:border-0 last:pb-0">
                        <div className="h-3 bg-[#E8E3DA] rounded w-1/3" />
                        <div className="h-3.5 bg-[#E8E3DA] rounded w-full" />
                        <div className="h-3.5 bg-[#E8E3DA] rounded w-4/5" />
                      </div>
                    ))}
                  </div>
                ) : trackedBills.length === 0 ? (
                  <EmptyState
                    message="No bills tracked yet."
                    href="/bills"
                    linkLabel="Browse bills →"
                  />
                ) : (
                  <div className="bg-white rounded-xl border border-[#D6CFC4] overflow-hidden">
                    {trackedBills.map((bill, idx) => {
                      const s = STATUS_STYLES[bill.status]
                      return (
                        <Link
                          key={bill.id}
                          href={`/bills/${bill.id}`}
                          className={`block px-5 py-4 hover:bg-[#F8F5F0] transition-colors ${idx < trackedBills.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="text-[11px] font-mono text-[#1C1C1A]/38">{bill.number}</span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
                              {bill.status}
                            </span>
                          </div>
                          <p className="text-sm text-[#1C1C1A] leading-snug mb-2.5" style={{ fontFamily: 'var(--font-serif)' }}>
                            {bill.title}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#1C1C1A]/40">{bill.category}</span>
                            <span className="text-[11px] text-[#1C1C1A]/30">{bill.lastAction}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

          </div>
        </main>
    </div>
  )
}

// Merges new activity items into the existing list, deduplicating by id
function mergeActivity(prev: ActivityItem[], next: ActivityItem[]): ActivityItem[] {
  const ids = new Set(prev.map(a => a.id))
  return [...prev, ...next.filter(a => !ids.has(a.id))].slice(0, 10)
}
