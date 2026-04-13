import type { Metadata } from 'next'

/**
 * Layout for the `/bills` segment.
 *
 * Exists solely to declare static metadata for the bills index. The detail
 * route (`/bills/[id]`) has its own layout with dynamic metadata.
 */

export const metadata: Metadata = {
  title: 'Bills',
  description:
    'Track legislation moving through Congress. Filter by topic, status, and more.',
  alternates: { canonical: '/bills' },
}

export default function BillsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
