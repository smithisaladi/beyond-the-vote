'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function Hero() {
  const router = useRouter()
  const [address, setAddress] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (address.trim()) {
      router.push(`/representatives?address=${encodeURIComponent(address.trim())}`)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-20 text-center">
      <h1
        className="text-6xl mb-6 tracking-tight leading-[1.1]"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        Know Who Really Represents You.
      </h1>

      <p className="text-xl text-[#1C1C1A]/70 mb-12 max-w-2xl mx-auto">
        Uncover the votes, funding, and values behind your elected officials.
        Democracy works best when it's transparent.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
        <div className="flex gap-3 bg-white rounded-lg border border-[rgba(28,28,26,0.15)] p-2 shadow-sm">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter your address"
            className="flex-1 px-4 py-3 bg-transparent outline-none text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
          />
          <button
            type="submit"
            className="px-8 py-3 bg-[#9B7FA6] text-white rounded-md hover:bg-[#8a6e95] transition-colors whitespace-nowrap"
          >
            Find My Representatives
          </button>
        </div>
      </form>
    </div>
  )
}
