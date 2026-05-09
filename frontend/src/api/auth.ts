import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { createElement } from 'react'
import { api } from './client'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  displayName: string
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On mount, ask the server who we are. The backend reads the bv_at cookie
  // (sent automatically) and returns 401 if it's missing or expired and
  // refresh fails.
  useEffect(() => {
    api
      .get<AuthUser>('/api/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  // Forced logout (e.g. refresh failure inside the request helper).
  useEffect(() => {
    const handler = () => setUser(null)
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<AuthUser>('/api/auth/login', { email, password })
    setUser(u)
  }, [])

  const signup = useCallback(async (email: string, password: string, fullName: string) => {
    const u = await api.post<AuthUser>('/api/auth/signup', { email, password, fullName })
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post<void>('/api/auth/logout')
    } catch {
      // Server-side logout is best-effort; the cookie-clear headers don't
      // arrive on network failure, but the user is gone from our state.
    }
    setUser(null)
  }, [])

  return createElement(
    AuthContext.Provider,
    { value: { user, isLoading, login, signup, logout } },
    children,
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
