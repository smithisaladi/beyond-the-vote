'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Navigation } from '@/components/Navigation'
import { RepresentativeCard } from '@/components/RepresentativeCard'
import { useMapboxAutocomplete } from '@/hooks/useMapboxAutocomplete'
import { useFetchRepresentatives } from '@/hooks/useFetchRepresentatives'

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
          <ellipse cx="400" cy="300" rx="380" ry="260" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="400" cy="300" rx="320" ry="210" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="405" cy="295" rx="260" ry="165" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="410" cy="290" rx="205" ry="125" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="415" cy="285" rx="155" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="418" cy="282" rx="110" ry="62"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="420" cy="280" rx="70"  ry="40"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="422" cy="278" rx="38"  ry="22"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="110" cy="500" rx="140" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1"   />
          <ellipse cx="115" cy="496" rx="95"  ry="58"  fill="none" stroke="#1C1C1A" strokeWidth="1"   />
          <ellipse cx="118" cy="493" rx="55"  ry="32"  fill="none" stroke="#1C1C1A" strokeWidth="1"   />
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

  // Sync input with URL param
  useEffect(() => {
    setAddress(addressParam)
  }, [addressParam])

  const { representatives, loading, error } = useFetchRepresentatives(addressParam)
  const {
    suggestions, showSuggestions, setShowSuggestions, clearSuggestions, containerRef,
  } = useMapboxAutocomplete(address)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    clearSuggestions()
    if (address.trim()) {
      router.push(`/representatives?address=${encodeURIComponent(address.trim())}`)
    }
  }

  const handleSelectSuggestion = (suggestion: string) => {
    setAddress(suggestion)
    clearSuggestions()
    router.push(`/representatives?address=${encodeURIComponent(suggestion)}`)
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

            <div className="relative" ref={containerRef}>
              <form onSubmit={handleSubmit}>
                <div className="flex gap-3 bg-white rounded-lg border border-[rgba(28,28,26,0.15)] p-2 shadow-sm">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => { setAddress(e.target.value); setShowSuggestions(true) }}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="Enter your address"
                    className="flex-1 px-4 py-3 bg-transparent outline-none text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 bg-[#9B7FA6] text-white rounded-md hover:bg-[#8a6e95] transition-colors whitespace-nowrap text-sm"
                  >
                    Find Representatives
                  </button>
                </div>
              </form>

              {/* Autocomplete dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-[rgba(28,28,26,0.12)] shadow-lg overflow-hidden z-20">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectSuggestion(s)}
                      className="w-full text-left px-5 py-3 text-sm text-[#1C1C1A]/80 hover:bg-[#F5F0E8] hover:text-[#1C1C1A] transition-colors border-b border-[rgba(28,28,26,0.05)] last:border-0"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          {hasResults && (
            <div className="max-w-5xl mx-auto">
              <p className="text-sm text-[#1C1C1A]/40 mb-6 text-center">
                Showing federal representatives for{' '}
                <span className="text-[#1C1C1A]/60 font-medium">{addressParam}</span>
              </p>

              {loading && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white rounded-xl border border-[#D6CFC4] p-6 animate-pulse">
                      <div className="flex items-start gap-3 mb-5">
                        <div className="w-12 h-12 rounded-full bg-[#E8E3DA] flex-shrink-0" />
                        <div className="flex-1 space-y-2 pt-1">
                          <div className="h-4 bg-[#E8E3DA] rounded w-3/4" />
                          <div className="h-3 bg-[#E8E3DA] rounded w-1/2" />
                        </div>
                      </div>
                      <div className="h-3 bg-[#E8E3DA] rounded w-1/4 mb-4" />
                      <div className="h-3 bg-[#E8E3DA] rounded w-full" />
                    </div>
                  ))}
                </div>
              )}

              {error && !loading && (
                <p className="text-center text-sm text-[#B85C38]">{error}</p>
              )}

              {!loading && !error && representatives.length === 0 && (
                <p className="text-center text-sm text-[#1C1C1A]/50">No representatives found for this address.</p>
              )}

              {!loading && !error && representatives.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {representatives.map((rep) => (
                    <RepresentativeCard key={rep.id} {...rep} />
                  ))}
                </div>
              )}
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
