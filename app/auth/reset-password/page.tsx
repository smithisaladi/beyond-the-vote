'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')

    const { error } = await createClient().auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#F5F0E8] rounded-lg shadow-xl p-8">
        <Link href="/" className="inline-block mb-8">
          <span className="text-xl font-semibold text-[#1C1C1A] tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
            Beyond the Ballot
          </span>
        </Link>

        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>Set New Password</h1>
        <p className="text-[#1C1C1A]/60 mb-8">Choose a strong password for your account.</p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm mb-2 text-[#1C1C1A]">New Password</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <div>
            <label htmlFor="confirm-new-password" className="block text-sm mb-2 text-[#1C1C1A]">Confirm New Password</label>
            <input
              id="confirm-new-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
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
