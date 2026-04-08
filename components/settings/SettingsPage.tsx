'use client'

import { useState, useEffect } from 'react'
import { useAccountSettings } from '@/hooks/useAccountSettings'
import { PageHeader } from '@/components/layout/PageHeader'

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

// ── Main component ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const {
    user,
    displayName, setDisplayName,
    notifPrefs, setNotifPrefs,
    updateName,
    changePassword,
    updateNotificationPreferences,
    signOut,
    name: nameState,
    password: passwordState,
    notifications: notifState,
  } = useAccountSettings()

  // Password fields (transient form state — not persisted)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Clear password fields on success
  useEffect(() => {
    if (passwordState.success) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }, [passwordState.success])

  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Active tab
  const [tab, setTab] = useState<'account' | 'notifications'>('account')

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    await signOut()
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    await changePassword(newPassword, confirmPassword)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-screen">

      <PageHeader title="Settings" />

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
                <form onSubmit={updateName} className="flex flex-col gap-4">
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
                  {nameState.error && <p className="text-sm text-[#B85C38]">{nameState.error}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={nameState.loading}
                      className="px-4 py-2 bg-[#9B7FA6] text-white text-sm rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
                    >
                      {nameState.loading ? 'Saving…' : 'Save'}
                    </button>
                    {nameState.success && <span className="text-sm text-[#6A9B7B]">Saved</span>}
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
                  {passwordState.error && <p className="text-sm text-[#B85C38]">{passwordState.error}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={passwordState.loading}
                      className="px-4 py-2 bg-[#9B7FA6] text-white text-sm rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
                    >
                      {passwordState.loading ? 'Updating…' : 'Update password'}
                    </button>
                    {passwordState.success && <span className="text-sm text-[#6A9B7B]">Password updated</span>}
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
            <form onSubmit={updateNotificationPreferences}>
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
                      <Toggle
                        checked={notifPrefs.emailEnabled}
                        onChange={(v) => setNotifPrefs(p => ({ ...p, emailEnabled: v }))}
                      />
                    </div>

                    {notifPrefs.emailEnabled && (
                      <div>
                        <p className="text-sm text-[#1C1C1A] mb-3">Frequency</p>
                        <div className="flex gap-2">
                          {(['immediate', 'daily', 'weekly'] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setNotifPrefs(p => ({ ...p, frequency: f }))}
                              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors capitalize ${
                                notifPrefs.frequency === f
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
                      <Toggle
                        checked={notifPrefs.notifyVote}
                        onChange={(v) => setNotifPrefs(p => ({ ...p, notifyVote: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between border-t border-[rgba(28,28,26,0.06)] pt-5">
                      <div>
                        <p className="text-sm text-[#1C1C1A]">A bill status changes</p>
                        <p className="text-xs text-[#1C1C1A]/50 mt-0.5">Updates on bills you are tracking move through committee</p>
                      </div>
                      <Toggle
                        checked={notifPrefs.notifyBillStatus}
                        onChange={(v) => setNotifPrefs(p => ({ ...p, notifyBillStatus: v }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={notifState.loading}
                    className="px-4 py-2 bg-[#9B7FA6] text-white text-sm rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
                  >
                    {notifState.loading ? 'Saving…' : 'Save preferences'}
                  </button>
                  {notifState.success && <span className="text-sm text-[#6A9B7B]">Saved</span>}
                </div>
              </div>
            </form>
          )}

        </div>
      </main>

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
