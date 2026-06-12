

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
import { STATUS_STYLES } from '@/lib/ui'

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
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-5 ${STATUS_STYLES.Failed.bg}`}>
            {icon}
          </div>
        )}

        <h2 className="text-xl font-semibold tracking-tight text-fg mb-2">
          {title}
        </h2>

        <p className="text-sm text-fg/55 mb-1 leading-relaxed">
          {description}
        </p>

        {/* Digest is opaque to users but useful for correlating server logs. */}
        {error.digest ? (
          <p className="text-[11px] text-fg/30 font-mono mb-6">
            Error ID: {error.digest}
          </p>
        ) : (
          <div className="mb-6" />
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 text-sm font-medium bg-accent-deep text-fg rounded-lg hover:bg-accent-deep-hover transition-colors"
          >
            Try again
          </button>
          <Link
            to={backHref as any}
            className="px-4 py-2 text-sm text-fg/60 border border-edge rounded-lg hover:text-fg hover:border-edge-soft transition-colors"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  )
}
