/**
 * Loading UI for the `/bills` segment.
 *
 * Rendered automatically by Next.js while the segment's server component
 * suspends. Mirrors the final layout so the transition feels like content
 * fading in rather than a full reflow.
 */

import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function BillsLoading() {
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
            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-72 mx-auto" />
          </div>

          {/* Search card */}
          <Card padding="none">
            <div className="flex items-center px-5 py-4 gap-3">
              <Skeleton className="w-4 h-4 flex-shrink-0" />
              <Skeleton className="flex-1 h-5" />
            </div>
          </Card>

          {/* Filter chips */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>

          {/* Bill card skeletons */}
          <div className="mt-8 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-2">
                      <Skeleton className="h-4 w-16 rounded-full" />
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                  <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
