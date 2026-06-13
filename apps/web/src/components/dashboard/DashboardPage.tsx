

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut, UserMinus } from 'lucide-react'

import { PARTY_STYLES, STATUS_STYLES, DANGER_HOVER_CLASS } from '@/lib/ui'
import { useAuth } from '@/components/auth/AuthContext'
import { useFollowedPoliticians, useFollowPolitician, useTrackedBills, useTopicPreferences } from "@/hooks/queries/useDashboard"
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageTransition } from '@/components/ui/motion'

function EmptyState({ message, href, linkLabel }: { message: string; href: string; linkLabel: string }) {
  return (
    <Card padding="none" className="px-5 py-8 text-center">
      <p className="text-[13px] text-fg/45 mb-2.5">{message}</p>
      <Link to={href as any} className="text-[13px] text-accent hover:underline underline-offset-2">
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
  const activityFeed: { id: string; politician: string | null; action: string; subject: string; date: string; timestamp: number; href: string | null; isAlert: boolean }[] = []
  const loading = loadingFollowed || loadingTracked

  const [photoErrors, setPhotoErrors] = useState<Set<string>>(new Set())
  const unfollowMutation = useFollowPolitician()
  const handleUnfollow = (politicianId: string) => {
    unfollowMutation.mutate({ politicianId, follow: false })
  }

  const visiblePoliticians = politicians

  const isNew = (_timestamp: number) => false

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <PageTransition>
        <div className="flex flex-col flex-1">
          {/* ── Header ── */}
          <header className="sticky top-0 bg-bg/90 backdrop-blur-sm border-b border-edge px-6 py-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] tracking-[0.07em] uppercase text-fg/40 mb-0.5">{formatToday()}</p>
              <h1 className="text-[26px] leading-tight font-serif font-semibold text-fg">
                {user ? `${getGreeting()}, ${getFirstName(user)}` : 'Dashboard'}
              </h1>
            </div>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="flex items-center gap-2 text-[13px] text-fg/45 hover:text-fg/75 transition-colors"
            >
              <span>Sign out</span>
              <LogOut size={16} strokeWidth={1.8} />
            </button>
          </header>

          {/* ── Content ── */}
          <main className="flex-1 px-6 py-6">
            <div className="max-w-5xl mx-auto">

              {/* ── Main two-column: Activity + Following ── */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

                {/* Activity feed — primary */}
                <ActivityFeed
                  activityFeed={activityFeed}
                  loading={loading}
                  isNew={isNew}
                />

                {/* Right column: Following + Tracked Bills */}
                <div className="min-w-0 flex flex-col gap-5">
                <section>
                  <div className="flex items-center justify-between mb-3 min-h-[30px]">
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-base font-serif font-semibold text-fg">Following</h2>
                      {!loading && <span className="text-xs font-mono tabular-nums text-fg/38">{visiblePoliticians.length}</span>}
                    </div>
                    <Link to="/representatives" className="text-xs text-accent hover:underline underline-offset-2">Find reps</Link>
                  </div>

                  {loading ? (
                    <Card padding="none" className="p-4 animate-pulse space-y-3">
                      {[1,2,3].map(i => (
                        <div key={i} className="flex items-center gap-3 pb-3 border-b border-edge-soft last:border-0 last:pb-0">
                          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3 w-3/4" />
                            <Skeleton className="h-2.5 w-1/2" />
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
                    <Card padding="none" className="overflow-hidden max-h-[300px] overflow-y-auto">
                      {visiblePoliticians.map((pol: { id: string; name: string; party: string; state: string; photo?: string }, idx: number) => {
                        const badge = PARTY_STYLES[pol.party as keyof typeof PARTY_STYLES] ?? PARTY_STYLES.Independent
                        return (
                          <div
                            key={pol.id}
                            className={`flex items-center gap-2.5 px-4 py-2.5 ${idx < visiblePoliticians.length - 1 ? 'border-b border-edge-soft' : ''}`}
                          >
                            <Link to="/representatives/$id" params={{ id: pol.id }} className="flex items-center gap-2.5 flex-1 min-w-0 group">
                              <div className="relative w-8 h-8 flex-shrink-0">
                                <div className="w-8 h-8 rounded-full bg-fg/[0.06] flex items-center justify-center">
                                  <span className="text-[10px] text-fg/50 font-medium">
                                    {pol.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}
                                  </span>
                                </div>
                                {pol.photo && !photoErrors.has(pol.id) && (
                                  <img
                                    src={pol.photo}
                                    alt={pol.name}
                                    className="absolute inset-0 w-8 h-8 rounded-full object-cover"
                                    onError={() => setPhotoErrors(prev => new Set([...prev, pol.id]))}
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] text-fg leading-snug group-hover:text-accent transition-colors truncate">
                                  {pol.name}
                                </p>
                                <p className="text-xs text-fg/45 truncate">
                                  <span className={badge.text}>{pol.party}</span> · {pol.state}
                                </p>
                              </div>
                            </Link>
                            <button
                              onClick={() => handleUnfollow(pol.id)}
                              disabled={unfollowMutation.isPending}
                              aria-label={`Unfollow ${pol.name}`}
                              className={`group/unfollow flex-shrink-0 p-1.5 rounded-lg transition-colors disabled:opacity-40 ${DANGER_HOVER_CLASS}`}
                            >
                              <UserMinus size={14} strokeWidth={1.8} />
                            </button>
                          </div>
                        )
                      })}
                    </Card>
                  )}
                </section>

                {/* Tracked Bills — below Following in right column */}
                <section className="min-w-0">
                  <div className="flex items-baseline justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-base font-serif font-semibold text-fg">Tracked Bills</h2>
                      {!loading && <span className="text-xs font-mono tabular-nums text-fg/38">{trackedBills.length}</span>}
                    </div>
                    <Link to={"/bills?tracked=true" as any} className="text-xs text-accent hover:underline underline-offset-2">View all</Link>
                  </div>

                  {loading ? (
                    <Card padding="none" className="p-4 animate-pulse space-y-3">
                      {[1,2,3].map(i => (
                        <div key={i} className="space-y-1.5 pb-3 border-b border-edge-soft last:border-0 last:pb-0">
                          <Skeleton className="h-2.5 w-1/3" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-4/5" />
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
                    <Card padding="none" className="overflow-hidden max-h-[360px] overflow-y-auto">
                      {trackedBills.map((bill: { id: string; number: string; title: string; status: string }, idx: number) => {
                        const s = STATUS_STYLES[bill.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Active
                        return (
                          <Link
                            key={bill.id}
                            to="/bills/$billId"
                            params={{ billId: bill.id }}
                            className={`block px-4 py-3 hover:bg-raised transition-all duration-150 cursor-pointer ${idx < trackedBills.length - 1 ? 'border-b border-edge-soft' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-[10px] font-mono text-fg/38">{bill.number}</span>
                              <span className={`text-[10px] font-medium px-1.5 py-px rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
                                {bill.status}
                              </span>
                            </div>
                            <p className="text-[13px] text-fg leading-snug line-clamp-2">
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
      </PageTransition>
    </div>
  )
}
