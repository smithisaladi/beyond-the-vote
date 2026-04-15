import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

/**
 * Layout for `/bills/[id]`.
 *
 * Its job is to compute dynamic metadata — title, description, and OG image
 * — from the bill row in Supabase. Keeping this in a *layout* (rather than
 * the page) means the metadata generation runs in parallel with the page's
 * own data fetching rather than sequentially.
 *
 * When the bill isn't found we return a minimal fallback title rather than
 * calling `notFound()`; the page itself is responsible for rendering the
 * not-found state so it can include a friendly back-link.
 */

// Revalidate metadata every 5 minutes — no need for force-dynamic since
// metadata only depends on the bill row, not user-specific data.
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
  const billId = decodeURIComponent(id)

  const supabase = await createClient()
  const { data } = await supabase
    .from('bills')
    .select('title, bill_number, status')
    .eq('bill_id', billId)
    .single()

  if (!data) {
    return { title: 'Bill' }
  }

  // Build OG image params — the `/api/og` route renders a card with this data.
  const ogParams = new URLSearchParams({
    type: 'bill',
    title: data.title,
    ...(data.bill_number ? { number: data.bill_number } : {}),
    ...(data.status ? { status: data.status } : {}),
  })

  const ogImage = `/api/og?${ogParams.toString()}`

  return {
    title: data.bill_number ? `${data.bill_number} — ${data.title}` : data.title,
    description: `Track ${data.bill_number ?? 'this bill'} through Congress — votes, sponsors, and timeline.`,
    openGraph: {
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      images: [ogImage],
    },
  }
}

export default function BillDetailLayout({ children }: LayoutProps) {
  return <>{children}</>
}
