'use client'

import Link from 'next/link'

export default function BillDetailError({
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
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="12" y1="9" x2="12.01" y2="9" />
          </svg>
        </div>

        <h2
          className="text-xl text-[#1C1C1A] mb-2"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
        >
          Could not load this bill
        </h2>
        <p className="text-sm text-[#1C1C1A]/55 mb-1 leading-relaxed">
          There was a problem fetching the bill details. This sometimes happens when Congress.gov is unavailable.
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
            href="/bills"
            className="px-4 py-2 text-sm text-[#1C1C1A]/60 border border-[rgba(28,28,26,0.15)] rounded-lg hover:text-[#1C1C1A] hover:border-[rgba(28,28,26,0.3)] transition-colors"
          >
            ← Back to Bills
          </Link>
        </div>
      </div>
    </div>
  )
}
