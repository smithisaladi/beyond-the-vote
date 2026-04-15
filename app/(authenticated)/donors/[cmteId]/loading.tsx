/**
 * Skeleton for `/donors/[cmteId]`.
 *
 * Matches the DetailSkeleton in PacDetailPage.tsx — back link,
 * header area, stat cards grid, and recipients table.
 */

export default function PacDetailLoading() {
  return (
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      <div className="relative z-10 flex flex-col flex-1">
        {/* Header placeholder — matches PageHeader */}
        <div className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
          <div className="h-5 w-28 bg-[#E8E3DA] rounded" />
          <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
        </div>

        <main className="flex-1 px-6 pt-10 pb-8">
          <div className="max-w-4xl mx-auto animate-pulse">
            {/* Back link */}
            <div className="h-4 w-24 bg-[#E8E3DA] rounded mb-8" />

            {/* Title area */}
            <div className="h-8 bg-[#E8E3DA] rounded w-2/3 mb-3" />
            <div className="h-4 bg-[#E8E3DA] rounded w-1/3 mb-8" />

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
                  <div className="h-2.5 bg-[#E8E3DA] rounded w-16 mb-3" />
                  <div className="h-6 bg-[#E8E3DA] rounded w-24" />
                </div>
              ))}
            </div>

            {/* Recipients table card */}
            <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
              <div className="h-5 bg-[#E8E3DA] rounded w-1/4 mb-5" />
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 bg-[#E8E3DA] rounded w-full mb-3" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
