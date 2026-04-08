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
    .from('bills')
    .select('title, bill_number, status')
    .eq('bill_id', decodeURIComponent(id))
    .single()

  if (!data) return { title: 'Bill' }

  const ogParams = new URLSearchParams({
    type: 'bill',
    title: data.title,
    ...(data.bill_number ? { number: data.bill_number } : {}),
    ...(data.status ? { status: data.status } : {}),
  })

  return {
    title: data.bill_number ? `${data.bill_number} — ${data.title}` : data.title,
    description: `Track ${data.bill_number ?? 'this bill'} through Congress — votes, sponsors, and timeline.`,
    openGraph: {
      images: [{ url: `/api/og?${ogParams}`, width: 1200, height: 630 }],
    },
    twitter: {
      images: [`/api/og?${ogParams}`],
    },
  }
}

export default function BillDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
