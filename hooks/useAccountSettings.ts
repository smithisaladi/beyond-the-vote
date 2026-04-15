'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { MIN_PASSWORD_LENGTH } from '@/lib/constants'
import type { UserMetadata } from '@/lib/supabase/types'

export function useAccountSettings() {
  const { user, signOut } = useAuth()

  // Display name
  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState({ loading: false, success: false, error: '' })

  // Password
  const [password, setPasswordState] = useState({ loading: false, success: false, error: '' })

  // Initialise from user metadata when user loads
  useEffect(() => {
    if (!user) return
    const meta = user.user_metadata as UserMetadata | undefined
    setDisplayName(meta?.full_name ?? '')
  }, [user])

  const updateName = async (e: React.FormEvent) => {
    e.preventDefault()
    setName({ loading: true, success: false, error: '' })
    const { error } = await createClient().auth.updateUser({ data: { full_name: displayName } })
    if (error) {
      setName({ loading: false, success: false, error: error.message })
    } else {
      setName({ loading: false, success: true, error: '' })
      setTimeout(() => setName(s => ({ ...s, success: false })), 3000)
    }
  }

  const changePassword = async (newPw: string, confirmPw: string) => {
    setPasswordState({ loading: false, success: false, error: '' })
    if (newPw !== confirmPw) {
      setPasswordState({ loading: false, success: false, error: 'Passwords do not match' })
      return false
    }
    if (newPw.length < MIN_PASSWORD_LENGTH) {
      setPasswordState({ loading: false, success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` })
      return false
    }
    setPasswordState({ loading: true, success: false, error: '' })
    const { error } = await createClient().auth.updateUser({ password: newPw })
    if (error) {
      setPasswordState({ loading: false, success: false, error: error.message })
      return false
    }
    setPasswordState({ loading: false, success: true, error: '' })
    setTimeout(() => setPasswordState(s => ({ ...s, success: false })), 3000)
    return true
  }

  return {
    user,
    displayName,
    setDisplayName,
    updateName,
    changePassword,
    signOut,
    name,
    password,
  }
}
