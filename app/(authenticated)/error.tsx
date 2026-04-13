'use client'

/**
 * Error boundary for the `(authenticated)` route group.
 *
 * Catches any unhandled error thrown by a page or nested layout inside
 * this group (except in `/bills/[id]` and `/representatives/[id]`, which
 * declare their own more specific boundaries). The `<SidebarLayout>` above
 * this boundary keeps rendering, so the user retains navigation while
 * seeing the error state in the content area.
 */

import { ErrorState } from '@/components/feedback/ErrorState'

export default function AuthenticatedError({
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
      title="Something went wrong"
      description="An error occurred while loading this page."
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
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      }
    />
  )
}
