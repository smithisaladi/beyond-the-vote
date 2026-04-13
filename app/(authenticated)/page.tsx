import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/landing/LandingPage'
import DashboardPage from '@/components/dashboard/DashboardPage'
import { siteConfig } from '@/lib/site-config'

/**
 * `/` — root of the application.
 *
 * Dual-purpose route: signed-out users see the marketing landing page;
 * signed-in users see their personalized dashboard at the same URL. This
 * keeps the "home" URL semantically stable regardless of auth state.
 *
 * Auth check happens server-side via `createClient()` + `getUser()` so the
 * correct HTML streams on first byte — no client-side flash between the
 * two experiences.
 *
 * Note: `(authenticated)/layout.tsx` performs the same `getUser()` call.
 * Supabase's server client caches the result within a single request, so
 * calling it twice does not issue two network requests.
 */

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description:
    "Track your elected representatives' voting records, follow legislation through Congress, and stay informed on the issues that matter to you. Free and nonpartisan.",
  openGraph: {
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description:
      'Track voting records, follow bills through Congress, and hold your representatives accountable. Free, nonpartisan, and built for every voter.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.name,
    description:
      'Track voting records and follow legislation. Free political transparency for every voter.',
  },
  alternates: { canonical: '/' },
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user ? <DashboardPage /> : <LandingPage />
}
