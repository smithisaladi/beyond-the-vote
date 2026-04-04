import Link from 'next/link'

export function Navigation() {
  return (
    <nav className="w-full border-b border-[rgba(28,28,26,0.1)]">
      <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#9B7FA6] rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">BB</span>
          </div>
          <span className="font-semibold text-lg" style={{ fontFamily: 'var(--font-serif)' }}>
            Beyond the Ballot
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/sign-in"
            className="px-5 py-2 text-[#1C1C1A] hover:text-[#9B7FA6] transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="px-5 py-2.5 bg-[#9B7FA6] text-white rounded-lg hover:bg-[#8a6e95] transition-colors"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </nav>
  )
}
