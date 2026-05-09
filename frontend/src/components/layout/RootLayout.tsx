import { Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { SidebarLayout } from './SidebarLayout'
import { AuthModalProvider } from '@/components/auth/AuthModalContext'

export function RootLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="animate-pulse text-[#1C1C1A]/30 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <AuthModalProvider>
      {user ? (
        <SidebarLayout>
          <Outlet />
        </SidebarLayout>
      ) : (
        <Outlet />
      )}
    </AuthModalProvider>
  )
}
