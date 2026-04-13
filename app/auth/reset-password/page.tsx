'use client'

/**
 * Password reset form.
 *
 * Entered after the user clicks a Supabase recovery link. That link arrives
 * with a `code` in the URL that `/auth/callback` exchanges for a session —
 * by the time this page renders, the client already has an authenticated
 * session scoped to the password-recovery flow, which is what allows
 * `auth.updateUser({ password })` to succeed without re-prompting for the
 * old password.
 *
 * Client component because it collects form input and calls the Supabase
 * client directly. No server-side validation is needed beyond what Supabase
 * enforces (password length, etc.), and keeping the logic here keeps the
 * auth flow self-contained.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { siteConfig } from '@/lib/site-config'

/** Minimum password length enforced client-side for fast feedback.
 *  Supabase enforces its own (configurable) minimum server-side. */
const MIN_PASSWORD_LENGTH = 8

export default function ResetPasswordPage() {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Client-side validation — these checks short-circuit before we hit the
    // network to keep the happy path snappy.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')

    const { error: updateError } = await createClient().auth.updateUser({ password })

    if (updateError) {
      // Surface Supabase's message verbatim — it's already user-friendly
      // (e.g. "New password should be different from the old password").
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Success — bounce the user back to the app. `router.refresh()` forces
    // server components to re-read the session cookie so the user appears
    // logged in immediately.
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#F5F0E8] rounded-lg shadow-xl p-8">
        <Link href="/" className="inline-block mb-8">
          <span
            className="text-xl font-semibold text-[#1C1C1A] tracking-tight"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {siteConfig.name}
          </span>
        </Link>

        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Set New Password
        </h1>
        <p className="text-[#1C1C1A]/60 mb-8">
          Choose a strong password for your account.
        </p>

        {error && (
          <p
            role="alert"
            aria-live="polite"
            className="text-red-600 text-sm mb-4"
          >
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="new-password"
              className="block text-sm mb-2 text-[#1C1C1A]"
            >
              New Password
            </label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={MIN_PASSWORD_LENGTH}
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <div>
            <label
              htmlFor="confirm-new-password"
              className="block text-sm mb-2 text-[#1C1C1A]"
            >
              Confirm New Password
            </label>
            <input
              id="confirm-new-password"
              name="confirm-new-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={MIN_PASSWORD_LENGTH}
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-[#9B7FA6] text-white rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
          >
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
