import { createClient } from '@/lib/supabase/server'
import { SidebarLayout } from '@/components/SidebarLayout'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <>{children}</>
  }

  return <SidebarLayout>{children}</SidebarLayout>
}
