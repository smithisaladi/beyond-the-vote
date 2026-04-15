/**
 * Loading UI for the `/donors` segment.
 *
 * Mirrors the DonorsPage layout: centered heading, search card,
 * and contributor card list.
 */

export default function DonorsLoading() {
  return (
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      {/* Header placeholder — matches PageHeader */}
      <div className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
        <div className="h-5 w-28 bg-[#E8E3DA] rounded" />
        <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
      </div>

      <main className="flex-1 px-6 pt-24 pb-8">
        <div className="max-w-4xl mx-auto animate-pulse">
          {/* Centered heading */}
          <div className="mb-5 text-center">
            <div className="h-8 w-56 bg-[#E8E3DA] rounded mx-auto mb-2" />
            <div className="h-4 w-80 bg-[#E8E3DA] rounded mx-auto" />
          </div>

          {/* Search card */}
          <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center px-5 py-4 gap-3">
              <div className="w-4 h-4 bg-[#E8E3DA] rounded flex-shrink-0" />
              <div className="flex-1 h-5 bg-[#E8E3DA] rounded" />
            </div>
          </div>

          {/* Contributor card skeletons */}
          <div className="mt-8 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <div className="flex items-baseline gap-3">
                    <div className="h-4 w-4 bg-[#E8E3DA] rounded" />
                    <div className="h-4 w-48 bg-[#E8E3DA] rounded" />
                  </div>
                  <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
                </div>
                <div className="h-3 bg-[#E8E3DA] rounded w-24 mb-3 ml-7" />
                <div className="border-t border-[rgba(28,28,26,0.06)] pt-3 ml-7 space-y-2">
                  <div className="h-3.5 bg-[#E8E3DA] rounded w-full" />
                  <div className="h-3.5 bg-[#E8E3DA] rounded w-5/6" />
                  <div className="h-3.5 bg-[#E8E3DA] rounded w-4/6" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
