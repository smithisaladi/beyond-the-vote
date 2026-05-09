import { useState, useEffect } from 'react'
import { useAuth } from '@/api/auth'
import { api } from '@/api/client'
import { MIN_PASSWORD_LENGTH } from '@/lib/constants'

export function useAccountSettings() {
  const { user, logout } = useAuth()

  // Display name
  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState({ loading: false, success: false, error: '' })

  // Password
  const [password, setPasswordState] = useState({ loading: false, success: false, error: '' })

  // Initialise from user metadata when user loads
  useEffect(() => {
    if (!user) return
    setDisplayName(user.fullName ?? '')
  }, [user])

  const updateName = async (e: React.FormEvent) => {
    e.preventDefault()
    setName({ loading: true, success: false, error: '' })
    try {
      await api.put('/api/auth/me', { fullName: displayName })
      setName({ loading: false, success: true, error: '' })
      setTimeout(() => setName(s => ({ ...s, success: false })), 3000)
    } catch (err) {
      setName({ loading: false, success: false, error: err instanceof Error ? err.message : 'Update failed' })
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
    try {
      await api.put('/api/auth/password', { password: newPw })
      setPasswordState({ loading: false, success: true, error: '' })
      setTimeout(() => setPasswordState(s => ({ ...s, success: false })), 3000)
      return true
    } catch (err) {
      setPasswordState({ loading: false, success: false, error: err instanceof Error ? err.message : 'Update failed' })
      return false
    }
  }

  return {
    user,
    displayName,
    setDisplayName,
    updateName,
    changePassword,
    signOut: logout,
    name,
    password,
  }
}
