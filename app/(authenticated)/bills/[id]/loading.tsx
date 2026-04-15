/**
 * Skeleton for `/bills/[id]`.
 *
 * Matches the DetailSkeleton in BillDetailPage.tsx so the transition
 * from loading to rendered content is a fade rather than a reflow.
 */

export default function BillDetailLoading() {
  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <div className="relative z-10 flex flex-col flex-1">
        <main className="flex-1 px-6 pt-10 pb-8">
          <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
            {/* Back-link placeholder */}
            <div className="h-5 w-28 bg-[#E8E3DA] rounded" />

            {/* Header card */}
            <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 sm:p-8 space-y-4">
              <div className="flex gap-3">
                <div className="h-5 w-20 bg-[#E8E3DA] rounded-full" />
                <div className="h-5 w-16 bg-[#E8E3DA] rounded-full" />
              </div>
              <div className="h-8 bg-[#E8E3DA] rounded w-3/4" />
              <div className="h-4 bg-[#E8E3DA] rounded w-1/4" />
            </div>

            {/* Summary card */}
            <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 h-32" />

            {/* Content grid: main column + sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 h-40" />
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 h-48" />
              </div>
              <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 h-64" />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
