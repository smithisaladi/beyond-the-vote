export default function BillDetailLoading() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="relative z-10 flex flex-col">
        <div className="h-16 border-b border-[rgba(28,28,26,0.06)] bg-[#F5F0E8]/80" />

        <main className="flex-1 px-6 py-10">
          <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
            <div className="h-5 w-28 bg-[#E8E3DA] rounded" />

            {/* Header card */}
            <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 sm:p-8 space-y-4">
              <div className="flex gap-3">
                <div className="h-5 w-20 bg-[#E8E3DA] rounded-full" />
                <div className="h-5 w-16 bg-[#E8E3DA] rounded-full" />
              </div>
              <div className="h-8 bg-[#E8E3DA] rounded w-3/4" />
              <div className="h-4 bg-[#E8E3DA] rounded w-1/4" />
            </div>

            {/* Summary card */}
            <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 h-32" />

            {/* Content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 h-40" />
                <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 h-48" />
              </div>
              <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 h-64" />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
