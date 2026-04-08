export default function RepresentativesLoading() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="relative z-10 flex flex-col">
        <div className="h-16 border-b border-[rgba(28,28,26,0.06)] bg-[#F5F0E8]/80" />

        <main className="flex-1 px-6 py-14">
          <div className="max-w-5xl mx-auto animate-pulse">
            {/* Title */}
            <div className="text-center mb-10">
              <div className="h-10 w-72 bg-[#E8E3DA] rounded mx-auto mb-3" />
              <div className="h-4 w-96 bg-[#E8E3DA] rounded mx-auto" />
            </div>

            {/* Search bar */}
            <div className="max-w-xl mx-auto mb-12">
              <div className="h-12 bg-white rounded-xl border border-[#D6CFC4]" />
            </div>

            {/* Rep card skeletons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] p-6 flex flex-col items-center gap-4"
                >
                  <div className="w-20 h-20 rounded-full bg-[#E8E3DA]" />
                  <div className="space-y-2 w-full text-center">
                    <div className="h-5 bg-[#E8E3DA] rounded w-3/4 mx-auto" />
                    <div className="h-3.5 bg-[#E8E3DA] rounded w-1/2 mx-auto" />
                  </div>
                  <div className="flex gap-2 justify-center">
                    <div className="h-5 w-20 bg-[#E8E3DA] rounded-full" />
                    <div className="h-5 w-10 bg-[#E8E3DA] rounded-full" />
                  </div>
                  <div className="w-full h-9 bg-[#E8E3DA] rounded-lg mt-1" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
