import type { Metadata } from 'next'

/**
 * Layout for the `/auth/reset-password` segment.
 *
 * Its only responsibility is to scope a route-specific `<title>` so this
 * sensitive flow doesn't display the default brand title in browser tabs
 * or when users bookmark the page mid-flow. The child page owns all
 * visible chrome.
 */

export const metadata: Metadata = {
  title: 'Reset Password',
  // Don't index — the URL is only reachable via a time-limited Supabase
  // recovery link and should never appear in search results.
  robots: { index: false, follow: false },
}

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
