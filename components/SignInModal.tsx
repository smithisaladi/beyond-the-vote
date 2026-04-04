'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from './Modal'
import { createClient } from '@/lib/supabase/client'

type View = 'sign-in' | 'forgot-password' | 'check-email'

interface SignInModalProps {
  isOpen: boolean
  onClose: () => void
  onSwitchToSignUp: () => void
}

export function SignInModal({ isOpen, onClose, onSwitchToSignUp }: SignInModalProps) {
  const router = useRouter()
  const [view, setView] = useState<View>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleClose = () => {
    onClose()
    setView('sign-in')
    setError('')
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await createClient().auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      handleClose()
      router.refresh()
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setLoading(false)
      setView('check-email')
    }
  }

  const handleGoogleSignIn = async () => {
    await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-8">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-[#1C1C1A]/40 hover:text-[#1C1C1A] transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {view === 'sign-in' && (
          <>
            <h2 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>Welcome Back</h2>
            <p className="text-[#1C1C1A]/60 mb-8">Sign in to track your representatives</p>

            <button
              onClick={handleGoogleSignIn}
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

            {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label htmlFor="signin-email" className="block text-sm mb-2 text-[#1C1C1A]">Email</label>
                <input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
                  required
                />
              </div>

              <div>
                <label htmlFor="signin-password" className="block text-sm mb-2 text-[#1C1C1A]">Password</label>
                <input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-[#1C1C1A]/70">
                  <input type="checkbox" className="rounded border-[rgba(28,28,26,0.2)]" />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => { setError(''); setView('forgot-password') }}
                  className="text-[#9B7FA6] hover:text-[#8a6e95]"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-[#9B7FA6] text-white rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-sm text-[#1C1C1A]/60 mt-6">
              Don't have an account?{' '}
              <button onClick={onSwitchToSignUp} className="text-[#9B7FA6] hover:text-[#8a6e95] font-medium">
                Sign up
              </button>
            </p>
          </>
        )}

        {view === 'forgot-password' && (
          <>
            <button
              onClick={() => { setError(''); setView('sign-in') }}
              className="flex items-center gap-2 text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors mb-6 text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
              Back to sign in
            </button>

            <h2 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>Reset Password</h2>
            <p className="text-[#1C1C1A]/60 mb-8">
              Enter your email and we'll send you a link to reset your password.
            </p>

            {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm mb-2 text-[#1C1C1A]">Email</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9B7FA6]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-[#9B7FA6] text-white rounded-lg hover:bg-[#8a6e95] transition-colors disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}

        {view === 'check-email' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-[#9B7FA6]/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9B7FA6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <h2 className="text-3xl mb-3" style={{ fontFamily: 'var(--font-serif)' }}>Check your email</h2>
            <p className="text-[#1C1C1A]/60 mb-8">
              We sent a password reset link to <span className="text-[#1C1C1A] font-medium">{email}</span>
            </p>
            <button
              onClick={() => { setError(''); setView('sign-in') }}
              className="text-sm text-[#9B7FA6] hover:text-[#8a6e95] font-medium"
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </Modal>
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
