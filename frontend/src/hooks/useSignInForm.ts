import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/api/auth'
import { api } from '@/api/client'

type View = 'sign-in' | 'forgot-password' | 'check-email'

export function useSignInForm(onClose: () => void) {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [view, setView] = useState<View>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleClose = () => {
    onClose()
    setView('sign-in')
    setError('')
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await login(email, password)
      setLoading(false)
      handleClose()
      const redirect = new URLSearchParams(window.location.search).get('redirect')
      if (redirect) {
        navigate(redirect)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await api.post('/api/auth/forgot-password', { email })
      setLoading(false)
      setView('check-email')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      setLoading(false)
    }
  }

  // Google OAuth is not yet supported in the standalone SPA backend.
  const handleGoogleSignIn = async () => {
    // TODO: Implement OAuth flow with the new backend
    console.warn('Google sign-in not yet implemented for standalone backend')
  }

  return {
    view, setView,
    email, setEmail,
    password, setPassword,
    error, setError,
    loading,
    handleClose,
    handleSignIn,
    handleForgotPassword,
    handleGoogleSignIn,
  }
}
