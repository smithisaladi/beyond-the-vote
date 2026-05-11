

import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut, UserMinus } from 'lucide-react'

import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import { useAuth } from '@/components/auth/AuthContext'
import { useFollowedPoliticians, useTrackedBills, useTopicPreferences } from "@/hooks/queries/useDashboard"
// TODO: port useActivitySeen hook
// TODO: port useUnfollowPolitician hook
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

function EmptyState({ message, href, linkLabel }: { message: string; href: string; linkLabel: string }) {
  return (
    <Card padding="none" className="px-6 py-10 text-center">
      <p className="text-sm text-[#1C1C1A]/45 mb-3">{message}</p>
      <Link to={href} className="text-sm text-[#7B5E8A] hover:underline underline-offset-2">
        {linkLabel}
      </Link>
    </Card>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getFirstName(user: { name?: string; email: string } | null): string {
  if (!user) return ''
  if (user.name) return user.name.trim().split(/\s+/)[0]
  return user.email.split('@')[0]
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
  const { data: followedData, isLoading: loadingFollowed } = useFollowedPoliticians()
  const { data: trackedData, isLoading: loadingTracked } = useTrackedBills()
  const politicians = followedData?.politicians || []
  const trackedBills = trackedData?.bills || []
  const activityFeed: any[] = []
  const loading = loadingFollowed || loadingTracked

  const [photoErrors, setPhotoErrors] = useState<Set<string>>(new Set())
  // TODO: port useUnfollowPolitician hook — stubbed for now
  const unfollowing = new Set<string>()
  const handleUnfollow = (_id: string) => {}
  const filterUnfollowed = (pols: any[]) => pols

  const visiblePoliticians = filterUnfollowed(politicians)

  const maxActivityTimestamp = useMemo(() => activityFeed.reduce((acc: number, a: any) => Math.max(acc, a.timestamp), 0), [activityFeed])
  // TODO: port useActivitySeen hook — stubbed for now
  const isNew = (_timestamp: number) => false

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
              <ActivityFeed
                activityFeed={activityFeed}
                loading={loading}
                isNew={isNew}
              />

              {/* Right column: Following + Tracked Bills */}
              <div className="min-w-0 flex flex-col gap-8">
              <section>
                <div className="flex items-center justify-between mb-5 min-h-[34px]">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Following</h2>
                    {!loading && <span className="text-sm text-[#1C1C1A]/38" style={{ fontFamily: 'var(--font-serif)' }}>{visiblePoliticians.length}</span>}
                  </div>
                  <Link to="/representatives" className="text-xs text-[#7B5E8A] hover:underline underline-offset-2">Find reps</Link>
                </div>

                {loading ? (
                  <Card padding="none" className="p-5 animate-pulse space-y-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-3 pb-4 border-b border-[rgba(28,28,26,0.05)] last:border-0 last:pb-0">
                        <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3.5 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </Card>
                ) : visiblePoliticians.length === 0 ? (
                  <EmptyState
                    message="No politicians followed yet."
                    href="/representatives"
                    linkLabel="Find your representatives →"
                  />
                ) : (
                  <Card padding="none" className="overflow-hidden max-h-[340px] overflow-y-auto">
                    {visiblePoliticians.map((pol, idx) => {
                      const badge = PARTY_STYLES[pol.party]
                      return (
                        <div
                          key={pol.id}
                          className={`flex items-center gap-3 px-5 py-3.5 ${idx < visiblePoliticians.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''}`}
                        >
                          <Link to={`/representatives/${pol.id}`} className="flex items-center gap-3 flex-1 min-w-0 group">
                            <div className="relative w-9 h-9 flex-shrink-0">
                              <div className="w-9 h-9 rounded-full bg-[#E8E3DA] flex items-center justify-center">
                                <span className="text-xs text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
                                  {pol.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                              {pol.photo && !photoErrors.has(pol.id) && (
                                <img
                                  src={pol.photo}
                                  alt={pol.name}
                                 
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
                  </Card>
                )}
              </section>

              {/* Tracked Bills — below Following in right column */}
              <section className="min-w-0">
                <div className="flex items-baseline justify-between mb-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Tracked Bills</h2>
                    {!loading && <span className="text-sm text-[#1C1C1A]/38" style={{ fontFamily: 'var(--font-serif)' }}>{trackedBills.length}</span>}
                  </div>
                  <Link to="/bills?tracked=true" className="text-xs text-[#7B5E8A] hover:underline underline-offset-2">View all</Link>
                </div>

                {loading ? (
                  <Card padding="none" className="p-5 animate-pulse space-y-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="space-y-2 pb-4 border-b border-[rgba(28,28,26,0.05)] last:border-0 last:pb-0">
                        <Skeleton className="h-3 w-1/3" />
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-4/5" />
                      </div>
                    ))}
                  </Card>
                ) : trackedBills.length === 0 ? (
                  <EmptyState
                    message="No bills tracked yet."
                    href="/bills"
                    linkLabel="Browse bills →"
                  />
                ) : (
                  <Card padding="none" className="overflow-hidden max-h-[400px] overflow-y-auto">
                    {trackedBills.map((bill, idx) => {
                      const s = STATUS_STYLES[bill.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Active
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
                  </Card>
                )}
              </section>
              </div>
            </div>

          </div>
        </main>
    </div>
  )
}
