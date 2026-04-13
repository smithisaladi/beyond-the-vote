import type { Metadata } from 'next'

/**
 * `/donors/[cmteId]` — PAC detail view.
 *
 * Re-exports the client component that owns the UI. The committee name
 * isn't in our database, so we fall back to a generic title rather than
 * making an extra FEC API call purely for metadata.
 */

export const metadata: Metadata = {
  title: 'Committee',
  description:
    'Federal contribution totals and recipients for this political action committee.',
}

export { default } from '@/components/donors/PacDetailPage'
