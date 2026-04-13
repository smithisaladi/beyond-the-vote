import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsPage from '@/components/settings/SettingsPage'

/**
 * `/settings` — authenticated account preferences.
 *
 * Server-side auth gate. Anonymous visitors are bounced to `/`; if we
 * returned the client component directly they would still see the
 * account shell flash before client-side hooks detected the missing
 * session.
 *
 * Metadata is declared in the sibling `layout.tsx`.
 */

export const dynamic = 'force-dynamic'

export default async function SettingsRoute() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  return <SettingsPage />
}
