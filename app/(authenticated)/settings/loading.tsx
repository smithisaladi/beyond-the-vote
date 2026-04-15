/**
 * Skeleton for `/settings`.
 *
 * Mirrors the SettingsPage layout: tab pills + form section cards.
 */

import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function SettingsLoading() {
  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* Header placeholder — matches PageHeader */}
      <div className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-16" />
      </div>

      <main className="flex-1 px-8 py-8">
        <div className="max-w-2xl animate-pulse">
          {/* Tab pills */}
          <div className="flex gap-1 mb-8 p-1 bg-[#E8E3DA] rounded-lg w-fit">
            <div className="h-8 w-24 bg-white rounded-md" />
            <div className="h-8 w-28 bg-transparent rounded-md" />
          </div>

          <div className="flex flex-col gap-6">
            {/* Profile section */}
            <Card border="light">
              <Skeleton className="h-5 w-16 mb-5" />
              <div className="space-y-4">
                <div>
                  <Skeleton className="h-3.5 w-24 mb-1.5" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div>
                  <Skeleton className="h-3.5 w-12 mb-1.5" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-9 w-16" />
              </div>
            </Card>

            {/* Password section */}
            <Card border="light">
              <Skeleton className="h-5 w-36 mb-5" />
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-9 w-36" />
              </div>
            </Card>

            {/* Danger zone */}
            <Card border="light">
              <Skeleton className="h-5 w-28 mb-3" />
              <Skeleton className="h-4 w-3/4 mb-4" />
              <Skeleton className="h-9 w-40" />
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
