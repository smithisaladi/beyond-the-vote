import { useAuth } from '@/hooks/useAuth'
import { LandingPage } from '@/components/landing/LandingPage'
import DashboardPage from '@/components/dashboard/DashboardPage'

export default function HomePage() {
  const { user, loading } = useAuth()

  if (loading) return null

  return user ? <DashboardPage /> : <LandingPage />
}
