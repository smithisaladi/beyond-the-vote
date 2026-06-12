import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export function ProfileSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <Skeleton className="h-5 w-28" />
      <Card>
        <div className="flex gap-5">
          <Skeleton className="w-20 h-20 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2.5 pt-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="w-20 h-8 rounded-lg flex-shrink-0" />
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
        <Card padding="none" className="h-64" />
        <Card padding="none" className="h-64" />
      </div>
    </div>
  )
}
