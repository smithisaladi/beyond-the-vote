

/**
 * Shared error UI used by route-level `error.tsx` boundaries.
 *
 * Next.js expects each `error.tsx` file to be a client component that receives
 * `{ error, reset }` props. Rather than duplicate the same centered-card
 * markup in every boundary, boundaries render this component and supply a
 * title, description, optional back-link, and an icon.
 *
 * Because this is rendered by a client boundary, it intentionally avoids
 * importing server-only modules. Icons are passed in as `ReactNode` so each
 * boundary can pick a semantically relevant glyph without expanding this
 * component's API.
 */

import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export interface ErrorStateProps {
  /** Short headline shown to the user. Sentence case, no trailing punctuation. */
  title: string
  /** One-line explanation suitable for all audiences. Avoid jargon. */
  description: string
  /**
   * Next.js-provided error with optional `digest`. The digest is surfaced to
   * users so they can reference it in support requests; the raw message is
   * intentionally not displayed to avoid leaking internals.
   */
  error: Error & { digest?: string }
  /** Retry handler — Next.js re-renders the segment when this is called. */
  reset: () => void
  /** Optional circular icon displayed above the title. */
  icon?: ReactNode
  /** Optional secondary action, typically a "back to list" link. */
  backHref?: string
  /** Label for the `backHref` link. Defaults to "Go home" with href="/". */
  backLabel?: string
}

export function ErrorState({
  title,
  description,
  error,
  reset,
  icon,
  backHref = '/',
  backLabel = 'Go home',
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="max-w-sm w-full">
        {icon && (
          <div className="w-12 h-12 rounded-full bg-[#B85C38]/10 flex items-center justify-center mx-auto mb-5">
            {icon}
          </div>
        )}

        <h2
          className="text-xl text-[#1C1C1A] mb-2"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
        >
          {title}
        </h2>

        <p className="text-sm text-[#1C1C1A]/55 mb-1 leading-relaxed">
          {description}
        </p>

        {/* Digest is opaque to users but useful for correlating server logs. */}
        {error.digest ? (
          <p className="text-[11px] text-[#1C1C1A]/30 font-mono mb-6">
            Error ID: {error.digest}
          </p>
        ) : (
          <div className="mb-6" />
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-[#7B5E8A] text-white text-sm font-medium rounded-lg hover:bg-[#6A4F78] transition-colors"
          >
            Try again
          </button>
          <Link
            href={backHref}
            className="px-4 py-2 text-sm text-[#1C1C1A]/60 border border-[rgba(28,28,26,0.15)] rounded-lg hover:text-[#1C1C1A] hover:border-[rgba(28,28,26,0.3)] transition-colors"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  )
}
