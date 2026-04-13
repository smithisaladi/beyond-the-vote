import type { Metadata } from 'next'

/**
 * Layout for the `/representatives` segment.
 *
 * Declares the static metadata for the representatives index; the detail
 * route `[id]` has its own layout that generates metadata per legislator.
 */

export const metadata: Metadata = {
  title: 'Find My Representatives',
  description:
    'Enter your address to find your federal senators and representatives.',
  alternates: { canonical: '/representatives' },
}

export default function RepresentativesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
