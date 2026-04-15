/**
 * Skeleton for `/dashboard`.
 *
 * Mirrors the two-column layout (activity feed + tracked bills sidebar)
 * plus the following strip at the bottom.
 */

export default function DashboardLoading() {
  return (
    <div className="relative flex-1 flex flex-col min-h-screen overflow-hidden">
      {/* Header — matches DashboardPage custom header */}
      <header className="relative z-10 sticky top-0 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
        <div className="h-6 w-32 bg-[#E8E3DA] rounded" />
        <div className="h-4 w-20 bg-[#E8E3DA] rounded" />
      </header>

      <main className="relative z-10 flex-1 px-8 py-8">
        <div className="max-w-5xl mx-auto animate-pulse">
          {/* Two-column grid */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 mb-10">

            {/* Activity feed */}
            <section>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-baseline gap-2.5">
                  <div className="h-5 w-20 bg-[#E8E3DA] rounded" />
                  <div className="h-4 w-28 bg-[#E8E3DA] rounded" />
                </div>
                <div className="flex gap-1">
                  <div className="h-6 w-10 bg-[#E8E3DA] rounded-full" />
                  <div className="h-6 w-10 bg-[#E8E3DA] rounded-full" />
                  <div className="h-6 w-12 bg-[#E8E3DA] rounded-full" />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#E8E3DA] mt-2 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-[#E8E3DA] rounded w-5/6" />
                      <div className="h-3 bg-[#E8E3DA] rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Tracked bills sidebar */}
            <section>
              <div className="flex items-baseline justify-between mb-5">
                <div className="flex items-baseline gap-2.5">
                  <div className="h-5 w-28 bg-[#E8E3DA] rounded" />
                  <div className="h-4 w-6 bg-[#E8E3DA] rounded" />
                </div>
                <div className="h-3 w-14 bg-[#E8E3DA] rounded" />
              </div>
              <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2 pb-4 border-b border-[rgba(28,28,26,0.05)] last:border-0 last:pb-0">
                    <div className="h-3 bg-[#E8E3DA] rounded w-1/3" />
                    <div className="h-3.5 bg-[#E8E3DA] rounded w-full" />
                    <div className="h-3.5 bg-[#E8E3DA] rounded w-4/5" />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Following strip */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <div className="h-4 w-20 bg-[#E8E3DA] rounded" />
              <div className="h-3 w-14 bg-[#E8E3DA] rounded" />
            </div>
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 w-9 rounded-full bg-[#E8E3DA]" />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
