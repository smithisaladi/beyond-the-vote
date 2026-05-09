
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { SignInModal } from './SignInModal'
import { SignUpModal } from './SignUpModal'

interface AuthModalContextValue {
  openSignIn: () => void
  openSignUp: () => void
  closeModal: () => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)

  const openSignIn = useCallback(() => setAuthModal('signin'), [])
  const openSignUp = useCallback(() => setAuthModal('signup'), [])
  const closeModal = useCallback(() => setAuthModal(null), [])

  return (
    <AuthModalContext.Provider value={{ openSignIn, openSignUp, closeModal }}>
      {children}
      <SignInModal
        isOpen={authModal === 'signin'}
        onClose={closeModal}
        onSwitchToSignUp={openSignUp}
      />
      <SignUpModal
        isOpen={authModal === 'signup'}
        onClose={closeModal}
        onSwitchToSignIn={openSignIn}
      />
    </AuthModalContext.Provider>
  )
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext)
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider')
  return ctx
}
