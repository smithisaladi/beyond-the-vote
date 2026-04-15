/**
 * Loading UI for the `/donors` segment.
 *
 * Mirrors the DonorsPage layout: centered heading, search card,
 * and contributor card list.
 */

import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function DonorsLoading() {
  return (
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      {/* Header placeholder — matches PageHeader */}
      <div className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-16" />
      </div>

      <main className="flex-1 px-6 pt-24 pb-8">
        <div className="max-w-4xl mx-auto animate-pulse">
          {/* Centered heading */}
          <div className="mb-5 text-center">
            <Skeleton className="h-8 w-56 mx-auto mb-2" />
            <Skeleton className="h-4 w-80 mx-auto" />
          </div>

          {/* Search card */}
          <Card padding="none">
            <div className="flex items-center px-5 py-4 gap-3">
              <Skeleton className="w-4 h-4 flex-shrink-0" />
              <Skeleton className="flex-1 h-5" />
            </div>
          </Card>

          {/* Contributor card skeletons */}
          <div className="mt-8 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} padding="none" className="p-5">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="flex items-baseline gap-3">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-3 w-24 mb-3 ml-7" />
                <div className="border-t border-[rgba(28,28,26,0.06)] pt-3 ml-7 space-y-2">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-5/6" />
                  <Skeleton className="h-3.5 w-4/6" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
