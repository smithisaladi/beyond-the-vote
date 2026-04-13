import { createClient } from '@/lib/supabase/server'
import { SidebarLayout } from '@/components/layout/SidebarLayout'

/**
 * Layout for the `(authenticated)` route group.
 *
 * The parenthesized segment name means this group does not appear in the
 * URL — routes inside live at `/`, `/bills`, `/representatives`, etc. The
 * group exists so signed-in and signed-out users share the same URL space
 * but receive different chrome:
 *
 *   - Signed-in  → app shell with sidebar navigation (`<SidebarLayout>`).
 *   - Signed-out → children render bare, so pages like `/` can present
 *                  the marketing landing experience with its own chrome.
 *
 * This is a Server Component so the Supabase call runs on the server and
 * the response streams with the correct shell from the first paint — no
 * client-side flicker between "landing" and "sidebar" treatments.
 *
 * Note: individual sub-routes that require authentication (e.g. `/settings`,
 * `/dashboard`) should additionally call `getUser()` themselves and issue
 * a redirect — this layout deliberately does not force-redirect anonymous
 * users because some routes in the group (e.g. `/bills`) are public.
 */

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Anonymous users get the raw children (the page decides whether to show
  // public content or gate it).
  if (!user) {
    return <>{children}</>
  }

  return <SidebarLayout>{children}</SidebarLayout>
}
