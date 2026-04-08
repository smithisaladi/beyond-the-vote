import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p
          className="text-8xl font-bold text-[#9B7FA6]/20 mb-2 leading-none select-none"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          404
        </p>
        <h1
          className="text-2xl text-[#1C1C1A] mb-3"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
        >
          Page not found
        </h1>
        <p className="text-sm text-[#1C1C1A]/55 mb-8 leading-relaxed">
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#9B7FA6] text-white text-sm font-medium rounded-lg hover:bg-[#8a6e95] transition-colors"
        >
          Back to home
        </Link>
      </div>

      <p
        className="absolute bottom-8 text-xs text-[#1C1C1A]/30"
        style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
      >
        Beyond the Ballot
      </p>
    </div>
  )
}
