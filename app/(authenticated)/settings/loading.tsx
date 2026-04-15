/**
 * Skeleton for `/settings`.
 *
 * Mirrors the SettingsPage layout: tab pills + form section cards.
 */

export default function SettingsLoading() {
  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* Header placeholder — matches PageHeader */}
      <div className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
        <div className="h-5 w-28 bg-[#E8E3DA] rounded" />
        <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
      </div>

      <main className="flex-1 px-8 py-8">
        <div className="max-w-2xl animate-pulse">
          {/* Tab pills */}
          <div className="flex gap-1 mb-8 p-1 bg-[#E8E3DA] rounded-lg w-fit">
            <div className="h-8 w-24 bg-white rounded-md" />
            <div className="h-8 w-28 bg-transparent rounded-md" />
          </div>

          <div className="flex flex-col gap-6">
            {/* Profile section */}
            <div className="bg-white rounded-xl border border-[#D6CFC4] p-6">
              <div className="h-5 bg-[#E8E3DA] rounded w-16 mb-5" />
              <div className="space-y-4">
                <div>
                  <div className="h-3.5 bg-[#E8E3DA] rounded w-24 mb-1.5" />
                  <div className="h-10 bg-[#E8E3DA] rounded w-full" />
                </div>
                <div>
                  <div className="h-3.5 bg-[#E8E3DA] rounded w-12 mb-1.5" />
                  <div className="h-10 bg-[#E8E3DA] rounded w-full" />
                </div>
                <div className="h-9 bg-[#E8E3DA] rounded w-16" />
              </div>
            </div>

            {/* Password section */}
            <div className="bg-white rounded-xl border border-[#D6CFC4] p-6">
              <div className="h-5 bg-[#E8E3DA] rounded w-36 mb-5" />
              <div className="space-y-4">
                <div className="h-10 bg-[#E8E3DA] rounded w-full" />
                <div className="h-10 bg-[#E8E3DA] rounded w-full" />
                <div className="h-10 bg-[#E8E3DA] rounded w-full" />
                <div className="h-9 bg-[#E8E3DA] rounded w-36" />
              </div>
            </div>

            {/* Danger zone */}
            <div className="bg-white rounded-xl border border-[#D6CFC4] p-6">
              <div className="h-5 bg-[#E8E3DA] rounded w-28 mb-3" />
              <div className="h-4 bg-[#E8E3DA] rounded w-3/4 mb-4" />
              <div className="h-9 bg-[#E8E3DA] rounded w-40" />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
