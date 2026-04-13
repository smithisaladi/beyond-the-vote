'use client'

/**
 * Error boundary for an individual legislator's detail page.
 *
 * Scoped to this route so the reset action retries just the detail view
 * rather than the entire segment, and so the back-link points at the
 * representatives index instead of the homepage.
 */

import { ErrorState } from '@/components/feedback/ErrorState'

export default function RepresentativeDetailError({
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
      title="Could not load this profile"
      description="There was a problem fetching the representative's profile. Please try again."
      backHref="/representatives"
      backLabel="← Back to Representatives"
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
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="18" y1="8" x2="23" y2="13" />
          <line x1="23" y1="8" x2="18" y2="13" />
        </svg>
      }
    />
  )
}
