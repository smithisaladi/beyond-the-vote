import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('legislators')
    .select('full_name, title, state, party')
    .eq('bioguide_id', id)
    .single()

  if (!data) return { title: 'Representative' }

  const ogParams = new URLSearchParams({
    type: 'politician',
    name: data.full_name,
    title: data.title,
    state: data.state,
    party: data.party,
  })

  return {
    title: data.full_name,
    description: `${data.title} from ${data.state} — voting record, donor funding, and bill activity.`,
    openGraph: {
      images: [{ url: `/api/og?${ogParams}`, width: 1200, height: 630 }],
    },
    twitter: {
      images: [`/api/og?${ogParams}`],
    },
  }
}

export default function RepresentativeDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
