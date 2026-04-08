'use client'

import Link from 'next/link'

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="max-w-sm w-full">
        <div className="w-12 h-12 rounded-full bg-[#B85C38]/10 flex items-center justify-center mx-auto mb-5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B85C38" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h2
          className="text-xl text-[#1C1C1A] mb-2"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
        >
          Something went wrong
        </h2>
        <p className="text-sm text-[#1C1C1A]/55 mb-1 leading-relaxed">
          An error occurred while loading this page.
        </p>
        {error.digest && (
          <p className="text-[11px] text-[#1C1C1A]/30 font-mono mb-6">
            Error ID: {error.digest}
          </p>
        )}
        {!error.digest && <div className="mb-6" />}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-[#9B7FA6] text-white text-sm font-medium rounded-lg hover:bg-[#8a6e95] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm text-[#1C1C1A]/60 border border-[rgba(28,28,26,0.15)] rounded-lg hover:text-[#1C1C1A] hover:border-[rgba(28,28,26,0.3)] transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
