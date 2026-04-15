'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { LogOut, UserMinus } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useDashboard } from '@/hooks/useDashboard'
import { DotGridBackground } from '@/components/shared/DotGridBackground'

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0][0]
  return (
    <div className="w-9 h-9 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
      <span className="text-xs text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-4 py-3.5 flex items-center gap-3 animate-pulse">
      <div className="w-9 h-9 rounded-full bg-[#E8E3DA] flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-[#E8E3DA] rounded w-3/4" />
        <div className="h-3 bg-[#E8E3DA] rounded w-1/2" />
      </div>
    </div>
  )
}

function EmptyState({ message, href, linkLabel }: { message: string; href: string; linkLabel: string }) {
  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-6 py-10 text-center">
      <p className="text-sm text-[#1C1C1A]/45 mb-3">{message}</p>
      <Link href={href} className="text-sm text-[#7B5E8A] hover:underline underline-offset-2">
        {linkLabel}
      </Link>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getFirstName(user: User): string {
  const name = user.user_metadata?.full_name as string | undefined
  if (name) return name.trim().split(/\s+/)[0]
  return user.email?.split('@')[0] ?? ''
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const {
    followedPoliticians: politicians,
    trackedBillDetails: trackedBills,
    activity: activityFeed,
    loading,
  } = useDashboard(user)

  const [activityTab, setActivityTab] = useState<'all' | 'bills' | 'votes'>('all')
  const [photoErrors, setPhotoErrors] = useState<Set<string>>(new Set())
  const [unfollowing, setUnfollowing] = useState<Set<string>>(new Set())

  async function handleUnfollow(politicianId: string) {
    if (!user || unfollowing.has(politicianId)) return
    setUnfollowing(prev => new Set([...prev, politicianId]))
    const supabase = createClient()
    await supabase
      .from('followed_politicians')
      .delete()
      .eq('user_id', user.id)
      .eq('politician_id', politicianId)
  }

  // Filter out unfollowed politicians optimistically (no page reload needed)
  const visiblePoliticians = politicians.filter(p => !unfollowing.has(p.id))

  const filteredActivity = activityFeed.filter(item => {
    if (activityTab === 'votes') return item.politician !== null
    if (activityTab === 'bills') return item.politician === null
    return true
  })

  return (
    <div className="relative flex-1 flex flex-col min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-dashboard" />

        {/* ── Header ── */}
        <header className="relative z-10 sticky top-0 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] px-8 py-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] tracking-wide uppercase text-[#1C1C1A]/38 mb-1">{formatToday()}</p>
            <h1 className="text-xl text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
              {user ? `${getGreeting()}, ${getFirstName(user)}` : 'Dashboard'}
            </h1>
          </div>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="flex items-center gap-2 text-sm text-[#1C1C1A]/45 hover:text-[#1C1C1A]/75 transition-colors"
          >
            <span>Sign out</span>
            <LogOut size={16} strokeWidth={1.8} />
          </button>
        </header>

        {/* ── Content ── */}
        <main className="relative z-10 flex-1 px-8 py-8">
          <div className="max-w-5xl mx-auto">

            {/* ── Main two-column: Activity + Following ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

              {/* Activity feed — primary */}
              <section>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Activity</h2>
                    <span className="text-sm text-[#1C1C1A]/38" style={{ fontFamily: 'var(--font-serif)' }}>Recent updates</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {(['all', 'bills', 'votes'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActivityTab(tab)}
                        className={`text-xs font-medium px-4 py-2 rounded-lg border transition-colors ${
                          activityTab === tab
                            ? 'bg-[#7B5E8A]/10 text-[#7B5E8A] border-[#7B5E8A]/20'
                            : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70 border-transparent'
                        }`}
                      >
                        {tab === 'all' ? 'All' : tab === 'bills' ? 'Bills' : 'Votes'}
                      </button>
                    ))}
                  </div>
                </div>

                {loading ? (
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 animate-pulse space-y-4">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="flex gap-3">
                        <div className="w-7 h-7 rounded-lg bg-[#E8E3DA] flex-shrink-0" />
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
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden max-h-[600px] overflow-y-auto">
                    {filteredActivity.map((item, idx) => {
                      const isVote = item.politician !== null
                      const dotColor = item.isAlert ? 'bg-[#B85C38]' : isVote ? 'bg-[#7B5E8A]/50' : 'bg-[#8A8A7A]/50'
                      const rowClass = `flex items-start gap-3.5 px-6 py-4 transition-all duration-150 ${
                        idx < filteredActivity.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''
                      } ${item.href ? 'hover:bg-[#F5F0E8]/60 cursor-pointer' : ''}`
                      const inner = (
                        <>
                          <div className={`w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0 ${dotColor}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-snug">
                              {item.politician && (
                                <span className="text-[#1C1C1A] font-medium">{item.politician} </span>
                              )}
                              <span className="text-[#1C1C1A]/45">{item.action}</span>
                            </p>
                            <p className="text-sm text-[#1C1C1A]/80 leading-snug mt-0.5">
                              {item.subject}
                            </p>
                          </div>
                          <span className="text-[11px] text-[#1C1C1A]/32 flex-shrink-0 mt-0.5 whitespace-nowrap">{item.date}</span>
                        </>
                      )
                      return item.href ? (
                        <Link key={item.id} href={item.href} className={`block ${rowClass}`}>
                          {inner}
                        </Link>
                      ) : (
                        <div key={item.id} className={rowClass}>
                          {inner}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Right column: Following + Tracked Bills */}
              <div className="min-w-0 flex flex-col gap-8">
              <section>
                <div className="flex items-baseline justify-between mb-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Following</h2>
                    {!loading && <span className="text-sm text-[#1C1C1A]/38" style={{ fontFamily: 'var(--font-serif)' }}>{visiblePoliticians.length}</span>}
                  </div>
                  <Link href="/representatives" className="text-xs text-[#7B5E8A] hover:underline underline-offset-2">Find reps</Link>
                </div>

                {loading ? (
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 animate-pulse space-y-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-3 pb-4 border-b border-[rgba(28,28,26,0.05)] last:border-0 last:pb-0">
                        <div className="w-9 h-9 rounded-full bg-[#E8E3DA] flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 bg-[#E8E3DA] rounded w-3/4" />
                          <div className="h-3 bg-[#E8E3DA] rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : visiblePoliticians.length === 0 ? (
                  <EmptyState
                    message="No politicians followed yet."
                    href="/representatives"
                    linkLabel="Find your representatives →"
                  />
                ) : (
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden max-h-[600px] overflow-y-auto">
                    {visiblePoliticians.map((pol, idx) => {
                      const badge = PARTY_STYLES[pol.party]
                      return (
                        <div
                          key={pol.id}
                          className={`flex items-center gap-3 px-5 py-3.5 ${idx < visiblePoliticians.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''}`}
                        >
                          <Link href={`/representatives/${pol.id}`} className="flex items-center gap-3 flex-1 min-w-0 group">
                            <div className="relative w-9 h-9 flex-shrink-0">
                              <div className="w-9 h-9 rounded-full bg-[#E8E3DA] flex items-center justify-center">
                                <span className="text-xs text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
                                  {pol.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                                </span>
                              </div>
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
                            <div className="min-w-0">
                              <p className="text-sm text-[#1C1C1A] leading-snug group-hover:text-[#7B5E8A] transition-colors truncate">
                                {pol.name}
                              </p>
                              <p className="text-[11px] text-[#1C1C1A]/45 truncate">
                                <span className={badge.text}>{pol.party}</span> · {pol.state}
                              </p>
                            </div>
                          </Link>
                          <button
                            onClick={() => handleUnfollow(pol.id)}
                            disabled={unfollowing.has(pol.id)}
                            aria-label={`Unfollow ${pol.name}`}
                            className="flex-shrink-0 p-1.5 rounded-lg text-[#1C1C1A]/25 hover:text-[#B85C38] hover:bg-[#B85C38]/8 transition-colors disabled:opacity-40"
                          >
                            <UserMinus size={15} strokeWidth={1.8} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Tracked Bills — below Following in right column */}
              <section className="min-w-0">
                <div className="flex items-baseline justify-between mb-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Tracked Bills</h2>
                    {!loading && <span className="text-sm text-[#1C1C1A]/38" style={{ fontFamily: 'var(--font-serif)' }}>{trackedBills.length}</span>}
                  </div>
                  <Link href="/bills?tracked=true" className="text-xs text-[#7B5E8A] hover:underline underline-offset-2">View all</Link>
                </div>

                {loading ? (
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
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden max-h-[400px] overflow-y-auto">
                    {trackedBills.map((bill, idx) => {
                      const s = STATUS_STYLES[bill.status]
                      return (
                        <Link
                          key={bill.id}
                          href={`/bills/${bill.id}`}
                          className={`block px-5 py-4 hover:bg-[#F8F5F0] hover:-translate-y-px transition-all duration-150 cursor-pointer ${idx < trackedBills.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="text-[11px] font-mono text-[#1C1C1A]/38">{bill.number}</span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
                              {bill.status}
                            </span>
                          </div>
                          <p className="text-sm text-[#1C1C1A] leading-snug line-clamp-2">
                            {bill.title}
                          </p>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </section>
              </div>
            </div>

          </div>
        </main>
    </div>
  )
}
