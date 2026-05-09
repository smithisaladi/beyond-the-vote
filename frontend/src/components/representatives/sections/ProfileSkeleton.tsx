import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export function ProfileSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <Skeleton className="h-5 w-28" />
      <Card padding="none" className="p-6 sm:p-8">
        <div className="flex gap-6">
          <Skeleton className="w-24 h-24 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-3 pt-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="w-24 h-9 rounded-lg flex-shrink-0" />
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <Card padding="none" className="h-64" />
        <Card padding="none" className="h-64" />
      </div>
    </div>
  )
}
