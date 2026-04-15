import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

/**
 * Layout for `/representatives/[id]`.
 *
 * Generates per-legislator metadata — title, description, and a dynamic
 * OG image rendered by `/api/og`. The image URL encodes the legislator's
 * name, chamber title, state, and party so the social preview matches the
 * page's hero card.
 *
 * Metadata generation runs in parallel with the page's own data fetching,
 * so pushing it into the layout (rather than combining it with the page)
 * keeps TTFB lower on social-card-bearing crawlers.
 */

// Revalidate metadata every 5 minutes — no need for force-dynamic since
// metadata only depends on the legislator row, not user-specific data.
export const revalidate = 300

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

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

  if (!data) {
    return { title: 'Representative' }
  }

  const ogParams = new URLSearchParams({
    type: 'politician',
    name: data.full_name,
    title: data.title,
    state: data.state,
    party: data.party,
  })
  const ogImage = `/api/og?${ogParams.toString()}`

  return {
    title: data.full_name,
    description: `${data.title} from ${data.state} — voting record, donor funding, and bill activity.`,
    openGraph: {
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      images: [ogImage],
    },
  }
}

export default function RepresentativeDetailLayout({ children }: LayoutProps) {
  return <>{children}</>
}
