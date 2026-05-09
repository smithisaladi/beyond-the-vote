
import { Modal } from './Modal'
import { useSignUpForm } from '@/hooks/useSignUpForm'

interface SignUpModalProps {
  isOpen: boolean
  onClose: () => void
  onSwitchToSignIn: () => void
}

export function SignUpModal({ isOpen, onClose, onSwitchToSignIn }: SignUpModalProps) {
  const {
    name, setName,
    email, setEmail,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    error,
    loading,
    handleClose,
    handleSubmit,
    handleGoogleSignUp,
  } = useSignUpForm(onClose)

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

        <h2 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>Join Beyond the Vote</h2>
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

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="signup-name" className="block text-sm mb-2 text-[#1C1C1A]">Full Name</label>
            <input
              id="signup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7B5E8A]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="block text-sm mb-2 text-[#1C1C1A]">Email</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7B5E8A]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-sm mb-2 text-[#1C1C1A]">Password</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7B5E8A]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-confirm" className="block text-sm mb-2 text-[#1C1C1A]">Confirm Password</label>
            <input
              id="signup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-white border border-[rgba(28,28,26,0.15)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7B5E8A]/50 text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
              required
            />
          </div>

          <label htmlFor="agree-terms" className="flex items-start gap-2 text-sm text-[#1C1C1A]/70">
            <input id="agree-terms" type="checkbox" className="mt-0.5 rounded border-[rgba(28,28,26,0.2)]" required />
            <span>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#7B5E8A] hover:text-[#6A4F78]">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#7B5E8A] hover:text-[#6A4F78]">Privacy Policy</a>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-[#7B5E8A] text-white rounded-lg hover:bg-[#6A4F78] transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-[#1C1C1A]/60 mt-6">
          Already have an account?{' '}
          <button onClick={onSwitchToSignIn} className="text-[#7B5E8A] hover:text-[#6A4F78] font-medium">
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
