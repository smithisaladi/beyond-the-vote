export default function TopicsLoading() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="relative z-10 flex flex-col">
        <div className="h-16 border-b border-[rgba(28,28,26,0.06)] bg-[#F5F0E8]/80" />

        <main className="flex-1 px-6 py-14">
          <div className="max-w-3xl mx-auto animate-pulse">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="h-10 w-80 bg-[#E8E3DA] rounded mx-auto mb-3" />
              <div className="h-4 w-64 bg-[#E8E3DA] rounded mx-auto" />
            </div>

            {/* Topic chip skeletons */}
            <div className="flex flex-wrap gap-3 justify-center mb-10">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 bg-white rounded-full border border-[#D6CFC4]"
                  style={{ width: `${60 + (i % 4) * 20}px` }}
                />
              ))}
            </div>

            {/* Bill row skeletons */}
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-[#D6CFC4] px-6 py-4 h-20"
                />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
