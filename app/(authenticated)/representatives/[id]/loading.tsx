/**
 * Skeleton for `/representatives/[id]`.
 *
 * Matches the ProfileSkeleton in RepresentativeDetailPage.tsx — avatar,
 * name/title, badges, and the two-column content grid.
 */

import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function RepresentativeDetailLoading() {
  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <div className="relative z-10 flex flex-col flex-1">
        <main className="flex-1 px-6 pt-10 pb-8">
          <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
            {/* Back-link */}
            <Skeleton className="h-5 w-28" />

            {/* Profile header card */}
            <Card padding="none" className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <Skeleton className="w-24 h-24 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-3 pt-2">
                  <Skeleton className="h-7 w-56" />
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="w-24 h-9 rounded-lg flex-shrink-0" />
              </div>
            </Card>

            {/* Main + sidebar content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
              <Card padding="none" className="h-64" />
              <Card padding="none" className="h-64" />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
