/**
 * Skeleton for `/dashboard`.
 *
 * Mirrors the two-column layout (activity feed + tracked bills sidebar)
 * plus the following strip at the bottom.
 */

import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="relative flex-1 flex flex-col min-h-screen overflow-hidden">
      {/* Header — matches DashboardPage custom header */}
      <header className="relative z-10 sticky top-0 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-20" />
      </header>

      <main className="relative z-10 flex-1 px-8 py-8">
        <div className="max-w-5xl mx-auto animate-pulse">
          {/* Two-column grid */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 mb-10">

            {/* Activity feed */}
            <section>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-baseline gap-2.5">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex gap-1">
                  <Skeleton className="h-6 w-10 rounded-full" />
                  <Skeleton className="h-6 w-10 rounded-full" />
                  <Skeleton className="h-6 w-12 rounded-full" />
                </div>
              </div>
              <Card className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-5/6" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </Card>
            </section>

            {/* Tracked bills sidebar */}
            <section>
              <div className="flex items-baseline justify-between mb-5">
                <div className="flex items-baseline gap-2.5">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-4 w-6" />
                </div>
                <Skeleton className="h-3 w-14" />
              </div>
              <Card padding="none" className="p-5 space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2 pb-4 border-b border-[rgba(28,28,26,0.05)] last:border-0 last:pb-0">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-4/5" />
                  </div>
                ))}
              </Card>
            </section>
          </div>

          {/* Following strip */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-14" />
            </div>
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-9 rounded-full" />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
