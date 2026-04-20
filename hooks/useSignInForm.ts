'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type View = 'sign-in' | 'forgot-password' | 'check-email'

export function useSignInForm(onClose: () => void) {
  const router = useRouter()
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

    const { error } = await createClient().auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setLoading(false)
      handleClose()
      const redirect = new URLSearchParams(window.location.search).get('redirect')
      if (redirect) {
        router.push(redirect)
      } else {
        router.refresh()
      }
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setLoading(false)
      setView('check-email')
    }
  }

  const handleGoogleSignIn = async () => {
    await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
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
