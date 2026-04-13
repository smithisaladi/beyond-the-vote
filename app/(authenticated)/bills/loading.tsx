/**
 * Loading UI for the `/bills` segment.
 *
 * Rendered automatically by Next.js while the segment's server component
 * suspends (e.g. during the initial data fetch). Mirrors the final
 * layout's structure so the transition feels like content fading in
 * rather than a full reflow.
 *
 * Skeleton colors use `#E8E3DA` per the design system; see
 * CLAUDE.md → "Skeleton / Loading".
 */

export default function BillsLoading() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="relative z-10 flex flex-col">
        {/* Sticky header placeholder */}
        <div className="h-16 border-b border-[rgba(28,28,26,0.06)] bg-[#F5F0E8]/80" />

        <main className="flex-1 px-6 py-10">
          <div className="max-w-3xl mx-auto animate-pulse">
            {/* Search + filter bar */}
            <div className="flex gap-3 mb-8">
              <div className="flex-1 h-10 bg-white rounded-lg border border-[rgba(28,28,26,0.08)]" />
              <div className="w-24 h-10 bg-white rounded-lg border border-[rgba(28,28,26,0.08)]" />
            </div>

            {/* Bill card skeletons — six rows roughly matches an above-the-fold viewport. */}
            <div className="flex flex-col gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
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
    </div>
  )
}
