/**
 * Skeleton for `/donors/[cmteId]`.
 *
 * Matches the DetailSkeleton in PacDetailPage.tsx — back link,
 * header area, stat cards grid, and recipients table.
 */

import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function PacDetailLoading() {
  return (
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      <div className="relative z-10 flex flex-col flex-1">
        {/* Header placeholder — matches PageHeader */}
        <div className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>

        <main className="flex-1 px-6 pt-10 pb-8">
          <div className="max-w-4xl mx-auto animate-pulse">
            {/* Back link */}
            <Skeleton className="h-4 w-24 mb-8" />

            {/* Title area */}
            <Skeleton className="h-8 w-2/3 mb-3" />
            <Skeleton className="h-4 w-1/3 mb-8" />

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} padding="none" className="p-5">
                  <Skeleton className="h-2.5 w-16 mb-3" />
                  <Skeleton className="h-6 w-24" />
                </Card>
              ))}
            </div>

            {/* Recipients table card */}
            <Card>
              <Skeleton className="h-5 w-1/4 mb-5" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full mb-3" />
              ))}
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
