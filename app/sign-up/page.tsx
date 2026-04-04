'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
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

    const { error } = await createClient().auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const handleGoogleSignUp = async () => {
    await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-[#F5F0E8] rounded-lg shadow-xl p-8">
        <Link href="/" className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-[#9B7FA6] rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">BB</span>
          </div>
          <span className="font-semibold text-lg" style={{ fontFamily: 'var(--font-serif)' }}>
            Beyond the Ballot
          </span>
        </Link>

        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Join Beyond the Ballot
        </h1>
        <p className="text-[#1C1C1A]/60 mb-8">Start tracking your representatives today</p>

        <button
          onClick={handleGoogleSignUp}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border border-[rgba(28,28,26,0.2)] rounded-lg hover:bg-white/80 transition-colors mb-6"
        >
          <GoogleIcon />
          <span className="text-[#1C1C1A]">Continue with Google</span>
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[rgba(28,28,26,0.1)]" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-[#F5F0E8] text-[#1C1C1A]/60">Or continue with email</span>
          </div>
        </div>

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm mb-2 text-[#1C1C1A]">Full Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm mb-2 text-[#1C1C1A]">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm mb-2 text-[#1C1C1A]">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-sm mb-2 text-[#1C1C1A]">Confirm Password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-[#1C1C1A]/70">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-[rgba(28,28,26,0.2)]"
              required
            />
            <span>
              I agree to the{' '}
              <button type="button" className="text-[#9B7FA6] hover:text-[#8a6e95]">Terms of Service</button>
              {' '}and{' '}
              <button type="button" className="text-[#9B7FA6] hover:text-[#8a6e95]">Privacy Policy</button>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-[#9B7FA6] text-white rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-[#1C1C1A]/60 mt-6">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-[#9B7FA6] hover:text-[#8a6e95] font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 01-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z" fill="#4285F4"/>
      <path d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0010 20z" fill="#34A853"/>
      <path d="M4.405 11.9c-.2-.6-.314-1.24-.314-1.9 0-.66.114-1.3.314-1.9V5.51H1.064A9.996 9.996 0 000 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59z" fill="#FBBC05"/>
      <path d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0 6.09 0 2.71 2.24 1.064 5.51l3.34 2.59C5.19 5.736 7.395 3.977 10 3.977z" fill="#EA4335"/>
    </svg>
  )
}
