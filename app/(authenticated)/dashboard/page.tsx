import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardPage from '@/components/dashboard/DashboardPage'

/**
 * `/dashboard` — signed-in home view.
 *
 * The actual UI lives in `components/dashboard/DashboardPage.tsx` (a client
 * component). This server-component wrapper:
 *   1. Declares the route's metadata.
 *   2. Enforces authentication — anonymous visitors are redirected to `/`,
 *      which renders the marketing landing page.
 *
 * Supabase's server client caches `getUser()` per request, so the identical
 * call in `(authenticated)/layout.tsx` does not cost a second round trip.
 */

export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'Your tracked bills, followed representatives, and recent activity in one place.',
  // Personal dashboard — never indexable.
  robots: { index: false, follow: false },
}

// The dashboard is entirely user-specific; disable static optimization.
export const dynamic = 'force-dynamic'

export default async function DashboardRoute() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  return <DashboardPage />
}
