'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Navigation } from '@/components/Navigation'
import { RepresentativeCard } from '@/components/RepresentativeCard'

const MOCK_REPS = [
  {
    id: '1',
    name: 'Margaret Chen',
    title: 'U.S. Senator',
    party: 'Democrat' as const,
    state: 'California',
    since: '2018',
    photo: null,
  },
  {
    id: '2',
    name: 'Robert Harmon',
    title: 'U.S. Senator',
    party: 'Republican' as const,
    state: 'California',
    since: '2014',
    photo: null,
  },
  {
    id: '3',
    name: 'Diana Reyes',
    title: 'U.S. Representative',
    party: 'Democrat' as const,
    state: 'California',
    district: '12th District',
    since: '2020',
    photo: null,
  },
]

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.045 }}
    >
      <defs>
        <pattern id="topo" x="0" y="0" width="800" height="600" patternUnits="userSpaceOnUse">
          {/* Outer contour rings — organic, offset ellipses */}
          <ellipse cx="400" cy="300" rx="380" ry="260" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="400" cy="300" rx="320" ry="210" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="405" cy="295" rx="260" ry="165" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="410" cy="290" rx="205" ry="125" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="415" cy="285" rx="155" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="418" cy="282" rx="110" ry="62"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="420" cy="280" rx="70"  ry="40"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="422" cy="278" rx="38"  ry="22"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          {/* Secondary hill — bottom-left */}
          <ellipse cx="110" cy="500" rx="140" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1"   />
          <ellipse cx="115" cy="496" rx="95"  ry="58"  fill="none" stroke="#1C1C1A" strokeWidth="1"   />
          <ellipse cx="118" cy="493" rx="55"  ry="32"  fill="none" stroke="#1C1C1A" strokeWidth="1"   />
          {/* Secondary hill — top-right */}
          <ellipse cx="700" cy="90"  rx="160" ry="100" fill="none" stroke="#1C1C1A" strokeWidth="1"   />
          <ellipse cx="704" cy="87"  rx="110" ry="65"  fill="none" stroke="#1C1C1A" strokeWidth="1"   />
          <ellipse cx="707" cy="85"  rx="65"  ry="38"  fill="none" stroke="#1C1C1A" strokeWidth="1"   />
          <ellipse cx="709" cy="83"  rx="30"  ry="18"  fill="none" stroke="#1C1C1A" strokeWidth="1"   />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo)" />
    </svg>
  )
}

function RepresentativesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const addressParam = searchParams.get('address') ?? ''

  const [address, setAddress] = useState(addressParam)
  const hasResults = addressParam.length > 0

  useEffect(() => {
    setAddress(addressParam)
  }, [addressParam])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (address.trim()) {
      router.push(`/representatives?address=${encodeURIComponent(address.trim())}`)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[#F5F0E8] overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col flex-1">
        <Navigation />

        <main className="flex-1 px-6 py-12">
          {/* Search */}
          <div className="max-w-2xl mx-auto mb-12">
            {!hasResults && (
              <div className="text-center mb-8">
                <h1
                  className="text-4xl mb-3 tracking-tight leading-[1.15]"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  Find Your Representatives
                </h1>
                <p className="text-[#1C1C1A]/60">
                  Enter your home address to see your federal representatives.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
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
                  className="px-6 py-3 bg-[#9B7FA6] text-white rounded-md hover:bg-[#8a6e95] transition-colors whitespace-nowrap text-sm"
                >
                  Find Representatives
                </button>
              </div>
            </form>
          </div>

          {/* Results */}
          {hasResults && (
            <div className="max-w-5xl mx-auto">
              <p className="text-sm text-[#1C1C1A]/40 mb-6 text-center">
                Showing federal representatives for{' '}
                <span className="text-[#1C1C1A]/60 font-medium">{addressParam}</span>
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {MOCK_REPS.map((rep) => (
                  <RepresentativeCard key={rep.id} {...rep} />
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default function RepresentativesPage() {
  return (
    <Suspense>
      <RepresentativesContent />
    </Suspense>
  )
}
