/**
 * Skeleton for `/representatives/[id]`.
 *
 * Mirrors the final profile layout — avatar + bio header, plus the two-column
 * content grid (main column + donor sidebar). Uses the standard `#E8E3DA`
 * skeleton fill on white cards.
 */

export default function RepresentativeDetailLoading() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="relative z-10 flex flex-col">
        <div className="h-16 border-b border-[rgba(28,28,26,0.06)] bg-[#F5F0E8]/80" />

        <main className="flex-1 px-6 py-10">
          <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
            {/* Back-link */}
            <div className="h-5 w-28 bg-[#E8E3DA] rounded" />

            {/* Profile header card */}
            <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 sm:p-8">
              <div className="flex gap-6">
                <div className="w-24 h-24 rounded-full bg-[#E8E3DA] flex-shrink-0" />
                <div className="flex-1 space-y-3 pt-2">
                  <div className="h-7 bg-[#E8E3DA] rounded w-56" />
                  <div className="h-4 bg-[#E8E3DA] rounded w-36" />
                  <div className="h-4 bg-[#E8E3DA] rounded w-48" />
                </div>
                <div className="w-24 h-9 bg-[#E8E3DA] rounded-lg flex-shrink-0" />
              </div>
            </div>

            {/* Main + sidebar content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
              <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] h-64" />
              <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] h-64" />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
