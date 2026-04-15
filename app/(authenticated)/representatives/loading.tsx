/**
 * Skeleton for the `/representatives` index.
 *
 * Mirrors the page heading + tabbed search card layout. No results
 * grid is shown since the page starts empty until the user searches.
 */

import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function RepresentativesLoading() {
  return (
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      {/* Header placeholder — matches PageHeader */}
      <div className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-16" />
      </div>

      <main className="relative z-10 flex-1 px-6 pt-24 pb-8">
        <div className="max-w-4xl mx-auto animate-pulse">
          {/* Centered heading */}
          <div className="mb-5 text-center">
            <Skeleton className="h-8 w-56 mx-auto mb-2" />
            <Skeleton className="h-4 w-80 mx-auto" />
          </div>

          {/* Tabbed search card */}
          <Card padding="none">
            {/* Tab bar */}
            <div className="flex border-b border-[rgba(28,28,26,0.06)]">
              <div className="flex-1 flex justify-center py-3">
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="w-px bg-[rgba(28,28,26,0.06)]" />
              <div className="flex-1 flex justify-center py-3">
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            {/* Search input area */}
            <div className="flex items-center px-5 py-4 gap-3">
              <Skeleton className="w-4 h-4 flex-shrink-0" />
              <Skeleton className="flex-1 h-5" />
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
