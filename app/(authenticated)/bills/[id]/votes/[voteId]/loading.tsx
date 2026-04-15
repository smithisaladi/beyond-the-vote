export default function VoteBreakdownLoading() {
  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <div className="relative z-10 flex flex-col flex-1">
        <main className="flex-1 px-6 pt-10 pb-8">
          <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
            <div className="h-5 w-28 bg-[#E8E3DA] rounded" />
            <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 sm:p-8 space-y-4">
              <div className="flex gap-3">
                <div className="h-5 w-16 bg-[#E8E3DA] rounded-full" />
                <div className="h-5 w-24 bg-[#E8E3DA] rounded-full" />
              </div>
              <div className="h-6 bg-[#E8E3DA] rounded w-2/3" />
              <div className="h-3 bg-[#E8E3DA] rounded-full w-full" />
              <div className="flex gap-8">
                <div className="h-8 w-16 bg-[#E8E3DA] rounded" />
                <div className="h-8 w-16 bg-[#E8E3DA] rounded" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 h-64" />
          </div>
        </main>
      </div>
    </div>
  )
}
