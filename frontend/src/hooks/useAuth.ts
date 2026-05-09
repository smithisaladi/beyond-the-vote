// Re-export the auth hook from the new API layer with backward-compatible
// property names so existing components don't need to be updated yet.
import { useAuth as useAuthBase } from '@/api/auth'
export type { AuthUser } from '@/api/auth'

export function useAuth() {
  const { user, isLoading, login, signup, logout } = useAuthBase()
  return {
    user,
    loading: isLoading,
    isLoading,
    login,
    signup,
    logout,
    signOut: logout,
  }
}
