/**
 * Loading UI for the `/bills` segment.
 *
 * Rendered automatically by Next.js while the segment's server component
 * suspends. Mirrors the final layout so the transition feels like content
 * fading in rather than a full reflow.
 */

export default function BillsLoading() {
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
            <div className="h-8 w-48 bg-[#E8E3DA] rounded mx-auto mb-2" />
            <div className="h-4 w-72 bg-[#E8E3DA] rounded mx-auto" />
          </div>

          {/* Search card */}
          <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center px-5 py-4 gap-3">
              <div className="w-4 h-4 bg-[#E8E3DA] rounded flex-shrink-0" />
              <div className="flex-1 h-5 bg-[#E8E3DA] rounded" />
            </div>
          </div>

          {/* Filter chips */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="h-7 w-16 bg-[#E8E3DA] rounded-full" />
            <div className="h-7 w-24 bg-[#E8E3DA] rounded-full" />
            <div className="h-7 w-16 bg-[#E8E3DA] rounded-full" />
          </div>

          {/* Bill card skeletons */}
          <div className="mt-8 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6"
              >
                <div className="flex gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-2">
                      <div className="h-4 w-16 bg-[#E8E3DA] rounded-full" />
                      <div className="h-4 w-16 bg-[#E8E3DA] rounded-full" />
                    </div>
                    <div className="h-5 bg-[#E8E3DA] rounded w-3/4" />
                    <div className="h-4 bg-[#E8E3DA] rounded w-full" />
                    <div className="h-4 bg-[#E8E3DA] rounded w-1/2" />
                  </div>
                  <div className="w-8 h-8 bg-[#E8E3DA] rounded-lg flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
