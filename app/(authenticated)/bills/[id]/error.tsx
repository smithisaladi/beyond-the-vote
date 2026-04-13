'use client'

/**
 * Error boundary scoped to a single bill's detail page.
 *
 * More specific than the group-level boundary (`(authenticated)/error.tsx`)
 * so we can suggest a bill-specific recovery path (back to the bills list)
 * and explain why the failure is likely transient (Congress.gov outages).
 */

import { ErrorState } from '@/components/feedback/ErrorState'

export default function BillDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Could not load this bill"
      description="There was a problem fetching the bill details. This sometimes happens when Congress.gov is unavailable."
      backHref="/bills"
      backLabel="← Back to Bills"
      icon={
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#B85C38"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="12" y1="9" x2="12.01" y2="9" />
        </svg>
      }
    />
  )
}
