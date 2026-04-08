import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/landing/LandingPage'
import DashboardPage from '@/components/dashboard/DashboardPage'

export const metadata: Metadata = {
  title: 'Beyond the Ballot — Political Transparency for Every Voter',
  description:
    'Track your elected representatives\' voting records, follow legislation through Congress, and stay informed on the issues that matter to you. Free and nonpartisan.',
  openGraph: {
    title: 'Beyond the Ballot — Political Transparency for Every Voter',
    description:
      'Track voting records, follow bills through Congress, and hold your representatives accountable. Free, nonpartisan, and built for every voter.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Beyond the Ballot',
    description: 'Track voting records and follow legislation. Free political transparency for every voter.',
  },
}

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    return <DashboardPage />
  }

  return <LandingPage />
}
