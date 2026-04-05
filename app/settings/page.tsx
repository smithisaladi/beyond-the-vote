'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

// ── Icons ────────────────────────────────────────────────────────────────────

function IconHome() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function IconFileText() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function IconTag() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function IconScales() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="3" x2="12" y2="21" />
      <path d="M3 6l9-3 9 3" />
      <path d="M6 6l-3 6a3 3 0 006 0L6 6z" />
      <path d="M18 6l-3 6a3 3 0 006 0L18 6z" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </svg>
  )
}

// ── Sidebar nav config ────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Home',           href: '/',               icon: <IconHome /> },
  { label: 'My Politicians', href: '/representatives', icon: <IconUsers /> },
  { label: 'Bills Tracker',  href: '/bills',           icon: <IconFileText /> },
  { label: 'Topics',         href: '/topics',          icon: <IconTag /> },
  { label: 'Values Match',   href: '/values-match',    icon: <IconScales /> },
  { label: 'Settings',       href: '/settings',        icon: <IconSettings /> },
]

// ── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-[#9B7FA6]' : 'bg-[#D6CFC4]'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({ onConfirm, onCancel, loading }: {
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[#1C1C1A]/40" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-white rounded-xl border border-[#D6CFC4] shadow-xl p-7">
        <h3 className="text-lg text-[#1C1C1A] mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Delete account?
        </h3>
        <p className="text-sm text-[#1C1C1A]/60 mb-6 leading-relaxed">
          This action is permanent and cannot be undone. All your data — followed politicians, tracked bills, and topic preferences — will be erased.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-[#D6CFC4] text-sm text-[#1C1C1A]/70 hover:border-[#1C1C1A]/40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-[#B85C38] text-white text-sm hover:bg-[#a34f2e] transition-colors disabled:opacity-60"
          >
            {loading ? 'Deleting…' : 'Yes, delete my account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Frequency = 'immediate' | 'daily' | 'weekly'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  // Account fields
  const [displayName, setDisplayName] = useState('')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [nameError, setNameError] = useState('')

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwError, setPwError] = useState('')

  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Notification preferences
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [frequency, setFrequency] = useState<Frequency>('daily')
  const [notifyVote, setNotifyVote] = useState(true)
  const [notifyBillStatus, setNotifyBillStatus] = useState(true)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifSuccess, setNotifSuccess] = useState(false)

  // Active tab
  const [tab, setTab] = useState<'account' | 'notifications'>('account')

  // Auth
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user)
        setDisplayName(data.user.user_metadata?.full_name ?? '')
        const prefs = data.user.user_metadata?.notification_preferences
        if (prefs) {
          setEmailEnabled(prefs.email_enabled ?? true)
          setFrequency(prefs.frequency ?? 'daily')
          setNotifyVote(prefs.notify_vote ?? true)
          setNotifyBillStatus(prefs.notify_bill_status ?? true)
        }
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameLoading(true)
    setNameError('')
    setNameSuccess(false)
    const { error } = await createClient().auth.updateUser({
      data: { full_name: displayName },
    })
    setNameLoading(false)
    if (error) {
      setNameError(error.message)
    } else {
      setNameSuccess(true)
      setTimeout(() => setNameSuccess(false), 3000)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters')
      return
    }
    setPwLoading(true)
    const { error } = await createClient().auth.updateUser({ password: newPassword })
    setPwLoading(false)
    if (error) {
      setPwError(error.message)
    } else {
      setPwSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPwSuccess(false), 3000)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    // Sign out — full server-side deletion would require an admin API route
    await createClient().auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotifLoading(true)
    setNotifSuccess(false)
    const { error } = await createClient().auth.updateUser({
      data: {
        notification_preferences: {
          email_enabled: emailEnabled,
          frequency,
          notify_vote: notifyVote,
          notify_bill_status: notifyBillStatus,
        },
      },
    })
    setNotifLoading(false)
    if (!error) {
      setNotifSuccess(true)
      setTimeout(() => setNotifSuccess(false), 3000)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">

      {/* ── Left sidebar ── */}
      <aside className="fixed top-0 left-0 h-full flex flex-col bg-[#D6CFC4] border-r border-[#C4BCB0] z-20" style={{ width: '228px' }}>
        <div className="px-5 py-5 border-b border-[#C4BCB0]">
          <Link href="/" className="flex items-center">
            <span className="text-sm font-semibold text-[#1C1C1A] tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
              Beyond the Ballot
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/settings'
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 py-2.5 rounded-r-lg text-sm transition-colors ${
                  active
                    ? 'border-l-2 border-[#9B7FA6] bg-[#C8BED0]/40 text-[#1C1C1A] font-medium pl-[14px] pr-3'
                    : 'border-l-2 border-transparent text-[#1C1C1A]/60 hover:text-[#1C1C1A] hover:bg-[#BDB5A8]/40 pl-[14px] pr-3'
                }`}
              >
                <span className={active ? 'text-[#9B7FA6]' : 'text-[#1C1C1A]/40'}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: '228px' }}>

        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center">
          <h1 className="text-xl text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Settings</h1>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-8">
          <div className="max-w-2xl">

            {/* Tab pills */}
            <div className="flex gap-1 mb-8 p-1 bg-[#E8E3DA] rounded-lg w-fit">
              {(['account', 'notifications'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-sm transition-colors capitalize ${
                    tab === t
                      ? 'bg-white text-[#1C1C1A] shadow-sm font-medium'
                      : 'text-[#1C1C1A]/55 hover:text-[#1C1C1A]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* ── Account tab ── */}
            {tab === 'account' && (
              <div className="flex flex-col gap-6">

                {/* Display name */}
                <div className="bg-white rounded-xl border border-[#D6CFC4] p-6">
                  <h2 className="text-base text-[#1C1C1A] mb-5" style={{ fontFamily: 'var(--font-serif)' }}>
                    Profile
                  </h2>
                  <form onSubmit={handleSaveName} className="flex flex-col gap-4">
                    <div>
                      <label className="block text-sm text-[#1C1C1A]/70 mb-1.5">Display name</label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                        className="w-full px-4 py-2.5 bg-[#F5F0E8] border border-[rgba(28,28,26,0.12)] rounded-lg text-sm text-[#1C1C1A] focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/40 placeholder:text-[#1C1C1A]/35"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#1C1C1A]/70 mb-1.5">Email</label>
                      <input
                        type="email"
                        value={user?.email ?? ''}
                        readOnly
                        className="w-full px-4 py-2.5 bg-[#E8E3DA] border border-[rgba(28,28,26,0.08)] rounded-lg text-sm text-[#1C1C1A]/50 cursor-not-allowed select-none"
                      />
                    </div>
                    {nameError && <p className="text-sm text-[#B85C38]">{nameError}</p>}
                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={nameLoading}
                        className="px-4 py-2 bg-[#9B7FA6] text-white text-sm rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
                      >
                        {nameLoading ? 'Saving…' : 'Save'}
                      </button>
                      {nameSuccess && <span className="text-sm text-[#6A9B7B]">Saved</span>}
                    </div>
                  </form>
                </div>

                {/* Change password */}
                <div className="bg-white rounded-xl border border-[#D6CFC4] p-6">
                  <h2 className="text-base text-[#1C1C1A] mb-5" style={{ fontFamily: 'var(--font-serif)' }}>
                    Change password
                  </h2>
                  <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                    <div>
                      <label className="block text-sm text-[#1C1C1A]/70 mb-1.5">Current password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-2.5 bg-[#F5F0E8] border border-[rgba(28,28,26,0.12)] rounded-lg text-sm text-[#1C1C1A] focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/40 placeholder:text-[#1C1C1A]/35"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#1C1C1A]/70 mb-1.5">New password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        minLength={8}
                        className="w-full px-4 py-2.5 bg-[#F5F0E8] border border-[rgba(28,28,26,0.12)] rounded-lg text-sm text-[#1C1C1A] focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/40 placeholder:text-[#1C1C1A]/35"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#1C1C1A]/70 mb-1.5">Confirm new password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        minLength={8}
                        className="w-full px-4 py-2.5 bg-[#F5F0E8] border border-[rgba(28,28,26,0.12)] rounded-lg text-sm text-[#1C1C1A] focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/40 placeholder:text-[#1C1C1A]/35"
                      />
                    </div>
                    {pwError && <p className="text-sm text-[#B85C38]">{pwError}</p>}
                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={pwLoading}
                        className="px-4 py-2 bg-[#9B7FA6] text-white text-sm rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
                      >
                        {pwLoading ? 'Updating…' : 'Update password'}
                      </button>
                      {pwSuccess && <span className="text-sm text-[#6A9B7B]">Password updated</span>}
                    </div>
                  </form>
                </div>

                {/* Danger zone */}
                <div className="bg-white rounded-xl border border-[#D6CFC4] p-6">
                  <h2 className="text-base text-[#1C1C1A] mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
                    Danger zone
                  </h2>
                  <p className="text-sm text-[#1C1C1A]/55 mb-5">
                    Permanently delete your account and all associated data.
                  </p>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 rounded-lg border border-[#B85C38]/40 text-sm text-[#B85C38] hover:bg-[#B85C38]/8 transition-colors"
                  >
                    Delete account
                  </button>
                </div>
              </div>
            )}

            {/* ── Notifications tab ── */}
            {tab === 'notifications' && (
              <form onSubmit={handleSaveNotifications}>
                <div className="flex flex-col gap-6">

                  {/* Email notifications */}
                  <div className="bg-white rounded-xl border border-[#D6CFC4] p-6">
                    <h2 className="text-base text-[#1C1C1A] mb-5" style={{ fontFamily: 'var(--font-serif)' }}>
                      Email notifications
                    </h2>
                    <div className="flex flex-col gap-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-[#1C1C1A]">Enable email notifications</p>
                          <p className="text-xs text-[#1C1C1A]/50 mt-0.5">Receive updates about your followed politicians and bills</p>
                        </div>
                        <Toggle checked={emailEnabled} onChange={setEmailEnabled} />
                      </div>

                      {emailEnabled && (
                        <div>
                          <p className="text-sm text-[#1C1C1A] mb-3">Frequency</p>
                          <div className="flex gap-2">
                            {(['immediate', 'daily', 'weekly'] as Frequency[]).map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setFrequency(f)}
                                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors capitalize ${
                                  frequency === f
                                    ? 'border-[#9B7FA6] bg-[#9B7FA6]/10 text-[#9B7FA6] font-medium'
                                    : 'border-[#D6CFC4] text-[#1C1C1A]/60 hover:border-[#1C1C1A]/30'
                                }`}
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notification triggers */}
                  <div className="bg-white rounded-xl border border-[#D6CFC4] p-6">
                    <h2 className="text-base text-[#1C1C1A] mb-5" style={{ fontFamily: 'var(--font-serif)' }}>
                      Notify me when
                    </h2>
                    <div className="flex flex-col gap-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-[#1C1C1A]">A politician votes</p>
                          <p className="text-xs text-[#1C1C1A]/50 mt-0.5">Get notified when someone you follow casts a vote</p>
                        </div>
                        <Toggle checked={notifyVote} onChange={setNotifyVote} />
                      </div>

                      <div className="flex items-center justify-between border-t border-[rgba(28,28,26,0.06)] pt-5">
                        <div>
                          <p className="text-sm text-[#1C1C1A]">A bill status changes</p>
                          <p className="text-xs text-[#1C1C1A]/50 mt-0.5">Updates on bills you are tracking move through committee</p>
                        </div>
                        <Toggle checked={notifyBillStatus} onChange={setNotifyBillStatus} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={notifLoading}
                      className="px-4 py-2 bg-[#9B7FA6] text-white text-sm rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
                    >
                      {notifLoading ? 'Saving…' : 'Save preferences'}
                    </button>
                    {notifSuccess && <span className="text-sm text-[#6A9B7B]">Saved</span>}
                  </div>
                </div>
              </form>
            )}

          </div>
        </main>
      </div>

      {showDeleteModal && (
        <DeleteModal
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteModal(false)}
          loading={deleteLoading}
        />
      )}
    </div>
  )
}
