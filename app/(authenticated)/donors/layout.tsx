import type { Metadata } from 'next'

/**
 * Layout for the `/donors` segment.
 *
 * Declares static metadata for the donors / PACs index. The detail route
 * (`/donors/[cmteId]`) intentionally does not generate per-committee
 * metadata — the committee name isn't in our database and fetching it
 * from the FEC on every metadata pass would double the TTFB of the page.
 */

export const metadata: Metadata = {
  title: 'Donors',
  description:
    'Browse political action committees (PACs) and their federal contributions.',
  alternates: { canonical: '/donors' },
}

export default function DonorsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
