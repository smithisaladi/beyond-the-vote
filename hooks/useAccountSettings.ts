'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

type Frequency = 'immediate' | 'daily' | 'weekly'

export type NotificationPreferences = {
  emailEnabled: boolean
  frequency: Frequency
  notifyVote: boolean
  notifyBillStatus: boolean
}

export function useAccountSettings() {
  const { user, signOut } = useAuth()

  // Display name
  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState({ loading: false, success: false, error: '' })

  // Password
  const [password, setPasswordState] = useState({ loading: false, success: false, error: '' })

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    emailEnabled: true,
    frequency: 'daily',
    notifyVote: true,
    notifyBillStatus: true,
  })
  const [notifications, setNotifications] = useState({ loading: false, success: false })

  // Initialise from user metadata when user loads
  useEffect(() => {
    if (!user) return
    setDisplayName(user.user_metadata?.full_name ?? '')
    const prefs = user.user_metadata?.notification_preferences
    if (prefs) {
      setNotifPrefs({
        emailEnabled:    prefs.email_enabled ?? true,
        frequency:       prefs.frequency ?? 'daily',
        notifyVote:      prefs.notify_vote ?? true,
        notifyBillStatus: prefs.notify_bill_status ?? true,
      })
    }
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
    if (newPw.length < 8) {
      setPasswordState({ loading: false, success: false, error: 'Password must be at least 8 characters' })
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

  const updateNotificationPreferences = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotifications({ loading: true, success: false })
    const { error } = await createClient().auth.updateUser({
      data: {
        notification_preferences: {
          email_enabled:    notifPrefs.emailEnabled,
          frequency:        notifPrefs.frequency,
          notify_vote:      notifPrefs.notifyVote,
          notify_bill_status: notifPrefs.notifyBillStatus,
        },
      },
    })
    if (!error) {
      setNotifications({ loading: false, success: true })
      setTimeout(() => setNotifications(s => ({ ...s, success: false })), 3000)
    } else {
      setNotifications({ loading: false, success: false })
    }
  }

  return {
    user,
    displayName,
    setDisplayName,
    notifPrefs,
    setNotifPrefs,
    updateName,
    changePassword,
    updateNotificationPreferences,
    signOut,
    name,
    password,
    notifications,
  }
}
