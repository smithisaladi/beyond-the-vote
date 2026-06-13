

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { Modal } from './Modal'
import { authClient } from '@/lib/auth/neon'
import { useAuth } from '@/components/auth/AuthContext'
import { Input } from '@/components/ui/Input'
import { STATUS_STYLES } from '@/lib/ui'

interface SignUpModalProps {
  isOpen: boolean
  onClose: () => void
  onSwitchToSignIn: () => void
}

export function SignUpModal({ isOpen, onClose, onSwitchToSignIn }: SignUpModalProps) {
  const { refreshSession } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const handleClose = () => { setError(''); onClose() }
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await authClient.signUp.email({ email, password, name })
      if (result.error) {
        setError(result.error.message || 'Sign up failed')
      } else {
        await refreshSession()
        onClose()
        navigate({ to: '/home' })
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed')
    }
    setLoading(false)
  }
  const handleGoogleSignUp = async () => {}

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-6">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-fg/40 hover:text-fg transition-colors"
        >
          <X size={20} strokeWidth={1.8} />
        </button>

        <h2 className="text-2xl text-fg mb-2 font-serif font-semibold">Join Beyond the Vote</h2>
        <p className="text-xs text-fg/60 mb-6">Start tracking your representatives today</p>

        <button
          onClick={handleGoogleSignUp}
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

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="signup-name" className="block text-xs mb-1.5 text-fg">Full Name</label>
            <Input
              id="signup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="block text-xs mb-1.5 text-fg">Email</label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-xs mb-1.5 text-fg">Password</label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-confirm" className="block text-xs mb-1.5 text-fg">Confirm Password</label>
            <Input
              id="signup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full"
              required
            />
          </div>

          <label htmlFor="agree-terms" className="flex items-start gap-2 text-xs text-fg/70">
            <input id="agree-terms" type="checkbox" className="mt-0.5 rounded border-edge" required />
            <span>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-deep-hover">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-deep-hover">Privacy Policy</a>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-2.5 bg-accent-deep text-fg text-[13px] rounded-lg hover:bg-accent-deep-hover transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-fg/60 mt-5">
          Already have an account?{' '}
          <button onClick={onSwitchToSignIn} className="text-accent hover:text-accent-deep-hover font-medium text-xs">
            Sign in
          </button>
        </p>
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
