
import { useState, useEffect } from 'react'
import { useAccountSettings } from '@/hooks/useAccountSettings'
import { PageHeader } from '@/components/layout/PageHeader'
import { DotGridBackground } from '@/components/shared/DotGridBackground'

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
    updateName,
    changePassword,
    signOut,
    name: nameState,
    password: passwordState,
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
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-settings" />

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader title="Settings" />

        {/* Content */}
        <main className="flex-1 px-6 pt-24 pb-8">
          <div className="max-w-4xl mx-auto">

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
                      className="w-full px-4 py-2.5 bg-[#F5F0E8] border border-[rgba(28,28,26,0.12)] rounded-lg text-sm text-[#1C1C1A] focus:outline-none focus:ring-2 focus:ring-[#7B5E8A]/40 placeholder:text-[#1C1C1A]/35"
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
                      className="px-4 py-2 bg-[#7B5E8A] text-white text-sm rounded-lg hover:bg-[#6A4F78] transition-colors disabled:opacity-60"
                    >
                      {nameState.loading ? 'Saving…' : 'Save'}
                    </button>
                    {nameState.success && <span className="text-sm text-[#68B085]">Saved</span>}
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
                      className="w-full px-4 py-2.5 bg-[#F5F0E8] border border-[rgba(28,28,26,0.12)] rounded-lg text-sm text-[#1C1C1A] focus:outline-none focus:ring-2 focus:ring-[#7B5E8A]/40 placeholder:text-[#1C1C1A]/35"
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
                      className="w-full px-4 py-2.5 bg-[#F5F0E8] border border-[rgba(28,28,26,0.12)] rounded-lg text-sm text-[#1C1C1A] focus:outline-none focus:ring-2 focus:ring-[#7B5E8A]/40 placeholder:text-[#1C1C1A]/35"
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
                      className="w-full px-4 py-2.5 bg-[#F5F0E8] border border-[rgba(28,28,26,0.12)] rounded-lg text-sm text-[#1C1C1A] focus:outline-none focus:ring-2 focus:ring-[#7B5E8A]/40 placeholder:text-[#1C1C1A]/35"
                    />
                  </div>
                  {passwordState.error && <p className="text-sm text-[#B85C38]">{passwordState.error}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={passwordState.loading}
                      className="px-4 py-2 bg-[#7B5E8A] text-white text-sm rounded-lg hover:bg-[#6A4F78] transition-colors disabled:opacity-60"
                    >
                      {passwordState.loading ? 'Updating…' : 'Update password'}
                    </button>
                    {passwordState.success && <span className="text-sm text-[#68B085]">Password updated</span>}
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
