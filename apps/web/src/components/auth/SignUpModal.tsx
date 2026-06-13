

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
