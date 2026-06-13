

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
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
  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-6">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-fg/40 hover:text-fg transition-colors"
        >
          <X size={20} strokeWidth={1.8} />
        </button>

        <h2 className="text-2xl text-fg mb-2 font-serif font-semibold">Welcome Back</h2>
        <p className="text-xs text-fg/60 mb-6">Sign in to track your representatives</p>

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

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-2.5 bg-accent-deep text-fg text-[13px] rounded-lg hover:bg-accent-deep-hover transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-fg/60 mt-5">
          Don&apos;t have an account?{' '}
          <button onClick={onSwitchToSignUp} className="text-accent hover:text-accent-deep-hover font-medium text-xs">
            Sign up
          </button>
        </p>
      </div>
    </Modal>
  )
}
