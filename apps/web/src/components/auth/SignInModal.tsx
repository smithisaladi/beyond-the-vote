

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Mail, X } from 'lucide-react'
import { Modal } from './Modal'
import { authClient } from '@/lib/auth/neon'
import { useAuth } from '@/components/auth/AuthContext'
import { Input } from '@/components/ui/Input'
import { STATUS_STYLES } from '@/lib/ui'

interface SignInModalProps {
  isOpen: boolean
  onClose: () => void
  onSwitchToSignUp: () => void
}

export function SignInModal({ isOpen, onClose, onSwitchToSignUp }: SignInModalProps) {
  const { refreshSession } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState<'sign-in' | 'forgot-password' | 'check-email'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const handleClose = () => { setError(''); onClose() }
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(result.error.message || 'Sign in failed')
      } else {
        await refreshSession()
        onClose()
        navigate({ to: '/home' })
      }
    } catch (err: any) {
      setError(err.message || 'Sign in failed')
    }
    setLoading(false)
  }
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setView('check-email')
  }
  const handleGoogleSignIn = async () => {}

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-6">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-fg/40 hover:text-fg transition-colors"
        >
          <X size={20} strokeWidth={1.8} />
        </button>

        {view === 'sign-in' && (
          <>
            <h2 className="text-2xl text-fg mb-2 tracking-tight">Welcome Back</h2>
            <p className="text-xs text-fg/60 mb-6">Sign in to track your representatives</p>

            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 px-6 py-2.5 bg-raised border border-edge rounded-lg hover:bg-fg/[0.06] transition-colors mb-5"
            >
              <GoogleIcon />
              <span className="text-[13px] text-fg">Continue with Google</span>
            </button>

            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-edge" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-surface text-fg/60">Or continue with email</span>
              </div>
            </div>

            {error && <p className={`${STATUS_STYLES.Failed.text} text-xs mb-3`}>{error}</p>}

            <form onSubmit={handleSignIn} className="space-y-3">
              <div>
                <label htmlFor="signin-email" className="block text-xs mb-1.5 text-fg">Email</label>
                <Input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full"
                  required
                />
              </div>

              <div>
                <label htmlFor="signin-password" className="block text-xs mb-1.5 text-fg">Password</label>
                <Input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <label htmlFor="remember-me" className="flex items-center gap-2 text-fg/70">
                  <input id="remember-me" type="checkbox" className="rounded border-edge" />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => { setError(''); setView('forgot-password') }}
                  className="text-accent hover:text-accent-deep-hover"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-2.5 bg-accent-deep text-fg text-[13px] rounded-lg hover:bg-accent-deep-hover transition-colors disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-xs text-fg/60 mt-5">
              Don&apos;t have an account?{' '}
              <button onClick={onSwitchToSignUp} className="text-accent hover:text-accent-deep-hover font-medium text-xs">
                Sign up
              </button>
            </p>
          </>
        )}

        {view === 'forgot-password' && (
          <>
            <button
              onClick={() => { setError(''); setView('sign-in') }}
              className="flex items-center gap-2 text-fg/50 hover:text-fg transition-colors mb-5 text-xs"
            >
              <ArrowLeft size={14} strokeWidth={1.8} />
              Back to sign in
            </button>

            <h2 className="text-2xl text-fg mb-2 tracking-tight">Reset Password</h2>
            <p className="text-xs text-fg/60 mb-6">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>

            {error && <p className={`${STATUS_STYLES.Failed.text} text-xs mb-3`}>{error}</p>}

            <form onSubmit={handleForgotPassword} className="space-y-3">
              <div>
                <label htmlFor="reset-email" className="block text-xs mb-1.5 text-fg">Email</label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-2.5 bg-accent-deep text-fg text-[13px] rounded-lg hover:bg-accent-deep-hover transition-colors disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}

        {view === 'check-email' && (
          <div className="text-center py-3">
            <div className="w-14 h-14 bg-accent-deep/[0.12] rounded-full flex items-center justify-center mx-auto mb-5">
              <Mail size={24} strokeWidth={1.8} className="text-accent" />
            </div>
            <h2 className="text-2xl text-fg mb-2 tracking-tight">Check your email</h2>
            <p className="text-xs text-fg/60 mb-6">
              We sent a password reset link to <span className="text-fg font-medium">{email}</span>
            </p>
            <button
              onClick={() => { setError(''); setView('sign-in') }}
              className="text-xs text-accent hover:text-accent-deep-hover font-medium"
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
