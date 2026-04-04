'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SignInModal } from './SignInModal'
import { SignUpModal } from './SignUpModal'

export function Navigation() {
  const [showSignIn, setShowSignIn] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)

  return (
    <>
      <nav className="w-full border-b border-[rgba(28,28,26,0.1)]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#9B7FA6] rounded flex items-center justify-center">
              <span className="text-white font-bold text-sm">BB</span>
            </div>
            <span className="font-semibold text-lg" style={{ fontFamily: 'var(--font-serif)' }}>
              Beyond the Ballot
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSignIn(true)}
              className="px-5 py-2 text-[#1C1C1A] hover:text-[#9B7FA6] transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => setShowSignUp(true)}
              className="px-5 py-2.5 bg-[#9B7FA6] text-white rounded-lg hover:bg-[#8a6e95] transition-colors"
            >
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      <SignInModal
        isOpen={showSignIn}
        onClose={() => setShowSignIn(false)}
        onSwitchToSignUp={() => { setShowSignIn(false); setShowSignUp(true) }}
      />
      <SignUpModal
        isOpen={showSignUp}
        onClose={() => setShowSignUp(false)}
        onSwitchToSignIn={() => { setShowSignUp(false); setShowSignIn(true) }}
      />
    </>
  )
}
