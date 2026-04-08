'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Bell, LogOut, Tag } from 'lucide-react'
import { topicToSlug } from '@/lib/topics'
import type { User } from '@supabase/supabase-js'
import type { BillStatus } from '@/lib/types'
import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import { useAuth } from '@/hooks/useAuth'
import { useDashboard } from '@/hooks/useDashboard'
import type { TopicFeedItem } from '@/hooks/useTopicBills'

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

// Bill progression indicator
function BillProgress({ status }: { status: BillStatus }) {
  const stages = ['Introduced', 'Committee', 'Floor Vote', 'Passed']
  const stageIndex: Record<string, number> = { Introduced: 0, Committee: 1, Active: 2, Passed: 3, Failed: 3, Stalled: 2 }
  const current = stageIndex[status] ?? 0
  const isFailed = status === 'Failed' || status === 'Stalled'
  return (
    <div className="flex items-center gap-1 mt-2.5">
      {stages.map((s, i) => (
        <div
          key={s}
          className={`h-1 flex-1 rounded-full ${
            i <= current
              ? isFailed && i === current
                ? 'bg-[#B85C38]/60'
                : 'bg-[#9B7FA6]/60'
              : 'bg-[#E8E3DA]'
          }`}
        />
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 animate-pulse">
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
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-6 py-10 text-center">
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

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const {
    followedPoliticians: politicians,
    trackedBillDetails: trackedBills,
    topicFeedItems,
    followedTopics,
    activity: activityFeed,
    loading,
  } = useDashboard(user)
  const loadingPoliticians = loading.politicians
  const loadingBills = loading.bills

  const [activityTab, setActivityTab] = useState<'all' | 'bills' | 'votes'>('all')
  const [photoErrors, setPhotoErrors] = useState<Set<string>>(new Set())

  const filteredActivity = activityFeed.filter(item => {
    if (activityTab === 'votes') return item.politician !== null
    if (activityTab === 'bills') return item.politician === null
    return true
  })

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
              <Bell size={19} />
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
              onClick={signOut}
              aria-label="Sign out"
              className="flex items-center gap-2 text-sm text-[#1C1C1A]/45 hover:text-[#1C1C1A]/75 transition-colors"
            >
              <span className="hidden sm:inline">Sign out</span>
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-8">
          <div className="max-w-5xl">

            {/* ── Following politicians ── */}
            <section className="mb-14">
              <div className="flex items-baseline gap-2.5 mb-5">
                <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Following</h2>
                {!loadingPoliticians && (
                  <span className="text-sm text-[#1C1C1A]/38">{politicians.length} politicians</span>
                )}
              </div>

              {loadingPoliticians ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {politicians.map((pol) => {
                    const badge = PARTY_STYLES[pol.party]
                    return (
                      <Link key={pol.id} href={`/representatives/${pol.id}`} className="group">
                        <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 flex flex-col gap-4 hover:shadow-md transition-shadow h-full cursor-pointer">

                          <div className="flex items-start gap-3">
                            {/* Photo with initials fallback */}
                            <div className="relative w-11 h-11 flex-shrink-0">
                              <Initials name={pol.name} />
                              {pol.photo && !photoErrors.has(pol.id) && (
                                <Image
                                  src={pol.photo}
                                  alt={pol.name}
                                  fill
                                  className="rounded-full object-cover"
                                  onError={() => setPhotoErrors(prev => new Set([...prev, pol.id]))}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-sm font-medium text-[#1C1C1A] truncate group-hover:text-[#9B7FA6] transition-colors"
                                style={{ fontFamily: 'var(--font-serif)' }}
                              >
                                {pol.name}
                              </p>
                              <p className="text-xs text-[#1C1C1A]/50 truncate mt-0.5">{pol.title}</p>
                              <p className="text-xs text-[#1C1C1A]/38">
                                {pol.state}{pol.district ? ` · ${pol.district}` : ''}
                              </p>
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
              <section className="mb-14">
                <div className="flex items-baseline justify-between mb-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Your Topics</h2>
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

                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] divide-y divide-[rgba(28,28,26,0.05)]">
                  {topicFeedItems.map(({ topic, bill }, i) => {
                    const s = STATUS_STYLES[bill.status as BillStatus] ?? STATUS_STYLES['Active']
                    return (
                      <Link key={i} href={`/bills/${bill.id}`} className="block px-6 py-5 hover:bg-[#F5F0E8]/60 transition-colors group">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Tag size={10} color="#9B7FA6" />
                          <span className="text-[10px] text-[#9B7FA6] font-medium">Because you follow {topic}</span>
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-mono text-[#1C1C1A]/38 mb-1">{bill.number}</p>
                            <p className="text-base font-medium text-[#1C1C1A] leading-snug group-hover:text-[#9B7FA6] transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>
                              {bill.title}
                            </p>
                            <BillProgress status={bill.status as BillStatus} />
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-1 ${s.bg} ${s.text}`}>
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
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Activity</h2>
                    <span className="text-sm text-[#1C1C1A]/38">Recent updates</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {(['all', 'bills', 'votes'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActivityTab(tab)}
                        className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                          activityTab === tab
                            ? 'bg-[#9B7FA6]/10 text-[#9B7FA6]'
                            : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70'
                        }`}
                      >
                        {tab === 'all' ? 'All' : tab === 'bills' ? 'Bill Updates' : 'Politician Votes'}
                      </button>
                    ))}
                  </div>
                </div>

                {loadingPoliticians && loadingBills ? (
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 animate-pulse space-y-4">
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
                ) : filteredActivity.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-6 py-10 text-center">
                    <p className="text-sm text-[#1C1C1A]/45">
                      {activityFeed.length === 0
                        ? 'No activity yet — follow politicians and track bills to see updates here.'
                        : 'No items in this category yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
                    {filteredActivity.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-4 px-6 py-5 ${
                          idx < filteredActivity.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''
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
                    <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Tracked Bills</h2>
                    {!loadingBills && <span className="text-sm text-[#1C1C1A]/38">{trackedBills.length}</span>}
                  </div>
                  <Link href="/bills" className="text-xs text-[#9B7FA6] hover:underline underline-offset-2">View all</Link>
                </div>

                {loadingBills ? (
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 animate-pulse space-y-4">
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
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
                    {trackedBills.map((bill, idx) => {
                      const s = STATUS_STYLES[bill.status]
                      return (
                        <Link
                          key={bill.id}
                          href={`/bills/${bill.id}`}
                          className={`block px-5 py-5 hover:bg-[#F8F5F0] transition-colors cursor-pointer ${idx < trackedBills.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="text-[11px] font-mono text-[#1C1C1A]/38">{bill.number}</span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
                              {bill.status}
                            </span>
                          </div>
                          <p className="text-sm text-[#1C1C1A] leading-snug mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
                            {bill.title}
                          </p>
                          <BillProgress status={bill.status} />
                          <div className="flex items-center justify-between mt-2.5">
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

