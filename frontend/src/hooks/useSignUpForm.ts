import { useState } from 'react'
import { useAuth } from '@/api/auth'

export function useSignUpForm(onClose: () => void) {
  const { signup } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleClose = () => {
    onClose()
    setName('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setError('')
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')

    try {
      await signup(email, password, name)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
      setLoading(false)
    }
  }

  // Google OAuth is not yet supported in the standalone SPA backend.
  const handleGoogleSignUp = async () => {
    // TODO: Implement OAuth flow with the new backend
    console.warn('Google sign-up not yet implemented for standalone backend')
  }

  return {
    name, setName,
    email, setEmail,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    error,
    loading,
    handleClose,
    handleSubmit,
    handleGoogleSignUp,
  }
}
