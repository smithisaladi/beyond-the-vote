import type { Metadata } from 'next'

/**
 * Layout for `/settings`.
 *
 * Keeps metadata colocated with the route and out of the client-only page
 * component. Settings is gated by auth and never indexed.
 */

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your account and notification preferences.',
  robots: { index: false, follow: false },
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
