/**
 * Skeleton for `/bills/[id]`.
 *
 * Matches the DetailSkeleton in BillDetailPage.tsx so the transition
 * from loading to rendered content is a fade rather than a reflow.
 */

import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function BillDetailLoading() {
  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <div className="relative z-10 flex flex-col flex-1">
        <main className="flex-1 px-6 pt-10 pb-8">
          <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
            {/* Back-link placeholder */}
            <Skeleton className="h-5 w-28" />

            {/* Header card */}
            <Card padding="none" className="p-6 sm:p-8 space-y-4">
              <div className="flex gap-3">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/4" />
            </Card>

            {/* Summary card */}
            <Card className="h-32" />

            {/* Content grid: main column + sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
              <div className="space-y-6">
                <Card className="h-40" />
                <Card className="h-48" />
              </div>
              <Card className="h-64" />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
