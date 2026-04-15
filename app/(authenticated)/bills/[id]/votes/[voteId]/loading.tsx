import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function VoteBreakdownLoading() {
  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <div className="relative z-10 flex flex-col flex-1">
        <main className="flex-1 px-6 pt-10 pb-8">
          <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
            <Skeleton className="h-5 w-28" />
            <Card padding="none" className="p-6 sm:p-8 space-y-4">
              <div className="flex gap-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-3 rounded-full w-full" />
              <div className="flex gap-8">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
              </div>
            </Card>
            <Card className="h-64" />
          </div>
        </main>
      </div>
    </div>
  )
}
