

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthContext'
import { authClient } from '@/lib/auth/neon'
import { DANGER_BUTTON_CLASS, STATUS_STYLES } from '@/lib/ui'
import { Input } from '@/components/ui/Input'
import { PageTransition } from '@/components/ui/motion'

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({ onConfirm, onCancel, loading }: {
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-surface border border-edge rounded-lg p-4">
        <h3 className="text-base font-serif font-semibold text-fg mb-2">
          Delete account?
        </h3>
        <p className="text-[13px] text-fg/60 mb-5 leading-relaxed">
          This action is permanent and cannot be undone. All your data — followed politicians, tracked bills, and topic preferences — will be erased.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-edge text-[13px] text-fg/70 hover:border-fg/40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-[13px] disabled:opacity-60 ${DANGER_BUTTON_CLASS}`}
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
  const { user, signOut } = useAuth()
  const [displayName, setDisplayName] = useState(user?.name ?? '')
  const [nameState, setNameState] = useState({ loading: false, error: '', success: false })
  const [passwordState, setPasswordState] = useState({ loading: false, error: '', success: false })

  // Sync displayName when user changes
  useEffect(() => {
    if (user?.name) setDisplayName(user.name)
  }, [user?.name])

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

  const updateName = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameState({ loading: true, error: '', success: false })
    try {
      await authClient.updateUser({ name: displayName })
      setNameState({ loading: false, error: '', success: true })
    } catch (err: any) {
      setNameState({ loading: false, error: err?.message ?? 'Failed to update name', success: false })
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setPasswordState({ loading: false, error: 'Passwords do not match', success: false })
      return
    }
    setPasswordState({ loading: true, error: '', success: false })
    try {
      await authClient.changePassword({ currentPassword, newPassword })
      setPasswordState({ loading: false, error: '', success: true })
    } catch (err: any) {
      setPasswordState({ loading: false, error: err?.message ?? 'Failed to update password', success: false })
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    try {
      await signOut()
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
    <PageTransition>
    <div className="flex flex-col flex-1 min-h-screen">
      <div className="flex flex-col flex-1">
        {/* Content */}
        <main className="flex-1 px-6 pt-8 pb-8">
          <div className="max-w-4xl mx-auto">

            <div className="flex flex-col gap-4">

              {/* Display name */}
              <div className="bg-surface rounded-lg border border-edge p-4">
                <h2 className="text-base font-serif font-semibold text-fg mb-4">
                  Profile
                </h2>
                <form onSubmit={updateName} className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs text-fg/70 mb-1.5">Display name</label>
                    <Input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg/70 mb-1.5">Email</label>
                    <Input
                      type="email"
                      value={user?.email ?? ''}
                      readOnly
                      className="w-full"
                    />
                  </div>
                  {nameState.error && <p className={`text-xs ${STATUS_STYLES.Failed.text}`}>{nameState.error}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={nameState.loading}
                      className="px-4 py-2 bg-accent-deep text-fg text-[13px] rounded-lg hover:bg-accent-deep-hover transition-colors disabled:opacity-60"
                    >
                      {nameState.loading ? 'Saving…' : 'Save'}
                    </button>
                    {nameState.success && <span className={`text-xs ${STATUS_STYLES.Passed.text}`}>Saved</span>}
                  </div>
                </form>
              </div>

              {/* Change password */}
              <div className="bg-surface rounded-lg border border-edge p-4">
                <h2 className="text-base font-serif font-semibold text-fg mb-4">
                  Change password
                </h2>
                <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs text-fg/70 mb-1.5">Current password</label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg/70 mb-1.5">New password</label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg/70 mb-1.5">Confirm new password</label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      className="w-full"
                    />
                  </div>
                  {passwordState.error && <p className={`text-xs ${STATUS_STYLES.Failed.text}`}>{passwordState.error}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={passwordState.loading}
                      className="px-4 py-2 bg-accent-deep text-fg text-[13px] rounded-lg hover:bg-accent-deep-hover transition-colors disabled:opacity-60"
                    >
                      {passwordState.loading ? 'Updating…' : 'Update password'}
                    </button>
                    {passwordState.success && <span className={`text-xs ${STATUS_STYLES.Passed.text}`}>Password updated</span>}
                  </div>
                </form>
              </div>

              {/* Danger zone */}
              <div className="bg-surface rounded-lg border border-edge p-4">
                <h2 className="text-base font-serif font-semibold text-fg mb-1">
                  Danger zone
                </h2>
                <p className="text-[13px] text-fg/55 mb-4">
                  Permanently delete your account and all associated data.
                </p>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className={`px-4 py-2 rounded-lg text-[13px] ${DANGER_BUTTON_CLASS}`}
                >
                  Delete account
                </button>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
    </PageTransition>

      {showDeleteModal && (
        <DeleteModal
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteModal(false)}
          loading={deleteLoading}
        />
      )}
    </>
  )
}
