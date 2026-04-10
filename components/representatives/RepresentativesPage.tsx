'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { RepresentativeCard } from '@/components/representatives/RepresentativeCard'
import { useMapboxAutocomplete } from '@/hooks/useMapboxAutocomplete'
import { useFetchRepresentatives } from '@/hooks/useFetchRepresentatives'
import { useSearchPoliticians } from '@/hooks/useSearchPoliticians'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/layout/PageHeader'

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

  const nameParam = searchParams.get('name') ?? ''
  const modeParam = searchParams.get('mode')

  const [address, setAddress] = useState(addressParam)
  const [inputFocused, setInputFocused] = useState(false)
  const [searchMode, setSearchMode] = useState<'address' | 'name'>(modeParam === 'address' ? 'address' : 'name')
  const [nameQuery, setNameQuery] = useState(nameParam)
  const hasResults = addressParam.length > 0

  // Resolve display address (shortened form for the input after submission)
  const shortAddress = addressParam.split(',').slice(0, 2).join(',').trim()
  const inputDisplayValue = hasResults && !inputFocused ? shortAddress : address

  const { user } = useAuth()
  const userId = user?.id ?? null

  // Sync input with URL param
  useEffect(() => {
    setAddress(addressParam)
  }, [addressParam])

  // Persist search state to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (searchMode === 'name') {
      params.set('mode', 'name')
      if (nameQuery) params.set('name', nameQuery)
      else params.delete('name')
      params.delete('address')
    } else {
      params.set('mode', 'address')
      params.delete('name')
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`
    if (newUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', newUrl)
    }
  }, [searchMode, nameQuery, searchParams])

  const { representatives, loading, error } = useFetchRepresentatives(addressParam)
  const {
    suggestions, showSuggestions, setShowSuggestions, clearSuggestions, containerRef,
  } = useMapboxAutocomplete(address)

  const { results: nameResults, loading: nameLoading } = useSearchPoliticians(nameQuery)

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

  // Displayed results depend on mode
  const displayRepresentatives = searchMode === 'name' ? nameResults : representatives
  const displayLoading = searchMode === 'name' ? nameLoading : loading
  const displayError = searchMode === 'name' ? '' : error
  const displayHasResults = searchMode === 'name' ? nameResults.length > 0 || nameLoading || nameQuery.length >= 3 : hasResults

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      <TopoBackground />
      <PageHeader title="Politicians" />
      <main className="relative z-10 flex-1 px-6 py-12">
          {/* Search */}
          <div className="max-w-2xl mx-auto mb-12">
            {!hasResults && searchMode === 'address' && (
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

            {searchMode === 'name' && (
              <div className="text-center mb-8">
                <h1
                  className="text-4xl mb-3 tracking-tight leading-[1.15]"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  Search by Name
                </h1>
                <p className="text-[#1C1C1A]/60">
                  Find any U.S. Senator or House Representative by name.
                </p>
              </div>
            )}

            {/* Mode tabs */}
            <div className="flex gap-1 p-1 bg-[#E8E3DA]/60 rounded-xl mb-5">
              <button
                onClick={() => setSearchMode('name')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  searchMode === 'name'
                    ? 'bg-white text-[#1C1C1A] shadow-sm'
                    : 'text-[#1C1C1A]/50 hover:text-[#1C1C1A]/75'
                }`}
              >
                Search by Name
              </button>
              <button
                onClick={() => setSearchMode('address')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  searchMode === 'address'
                    ? 'bg-white text-[#1C1C1A] shadow-sm'
                    : 'text-[#1C1C1A]/50 hover:text-[#1C1C1A]/75'
                }`}
              >
                Search by Address
              </button>
            </div>

            {/* Address search */}
            {searchMode === 'address' && (
              <div className="relative" ref={containerRef}>
                <form onSubmit={handleSubmit}>
                  <div className="flex items-center bg-white rounded-lg border border-[rgba(28,28,26,0.15)] px-4 py-3 shadow-sm gap-3">
                    <Search size={16} className="text-[#1C1C1A]/30 flex-shrink-0" />
                    <input
                      type="text"
                      value={inputDisplayValue}
                      onChange={(e) => { setAddress(e.target.value); setShowSuggestions(true) }}
                      onFocus={() => { setInputFocused(true); suggestions.length > 0 && setShowSuggestions(true) }}
                      onBlur={() => { setInputFocused(false); setTimeout(() => setShowSuggestions(false), 200) }}
                      placeholder="Enter your address"
                      className="flex-1 bg-transparent outline-none text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
                      autoComplete="off"
                    />
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
            )}

            {/* Name search */}
            {searchMode === 'name' && (
              <div className="relative">
                <div className="flex items-center bg-white rounded-lg border border-[rgba(28,28,26,0.15)] px-4 py-3 shadow-sm gap-3">
                  <Search size={16} className="text-[#1C1C1A]/30 flex-shrink-0" />
                  <input
                    type="text"
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    placeholder="Search by name (e.g. Elizabeth Warren)"
                    className="flex-1 bg-transparent outline-none text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                {nameQuery.length > 0 && nameQuery.length < 3 && (
                  <p className="text-xs text-[#1C1C1A]/38 mt-2 px-1">Type at least 3 characters to search</p>
                )}
              </div>
            )}

            {/* Pre-search empty state (address mode only) */}
            {!hasResults && searchMode === 'address' && (
              <div className="mt-10 text-center">
                <p className="text-sm text-[#1C1C1A]/55 max-w-md mx-auto leading-relaxed mb-3">
                  Your federal representatives are the two U.S. Senators from your state and the House Representative for your congressional district.
                </p>
                <p className="text-xs text-[#1C1C1A]/38 mb-10">
                  Your address is used only to identify your congressional district and is never stored.
                </p>
                {/* Ghost skeleton preview */}
                <div className="grid grid-cols-3 gap-4 opacity-25 pointer-events-none select-none">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] p-6 flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-[#E8E3DA]" />
                      <div className="h-3 bg-[#E8E3DA] rounded w-3/4" />
                      <div className="h-2.5 bg-[#E8E3DA] rounded w-1/2" />
                      <div className="h-7 bg-[#E8E3DA] rounded-lg w-full mt-1" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {nameQuery.length === 0 && searchMode === 'name' && (
              <div className="mt-10 text-center">
                <p className="text-sm text-[#1C1C1A]/55 max-w-md mx-auto leading-relaxed mb-3">
                  Search for any current member of the U.S. Senate or House of Representatives.
                </p>
                <p className="text-xs text-[#1C1C1A]/38 mb-10">
                  Type at least 3 characters to begin searching.
                </p>
                {/* Ghost skeleton preview */}
                <div className="grid grid-cols-3 gap-4 opacity-25 pointer-events-none select-none">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] p-6 flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-[#E8E3DA]" />
                      <div className="h-3 bg-[#E8E3DA] rounded w-3/4" />
                      <div className="h-2.5 bg-[#E8E3DA] rounded w-1/2" />
                      <div className="h-7 bg-[#E8E3DA] rounded-lg w-full mt-1" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          {displayHasResults && (
            <div className="max-w-5xl mx-auto">
              {hasResults && searchMode === 'address' && (
                <p className="text-sm text-[#1C1C1A]/40 mb-6 text-center">
                  Showing federal representatives for{' '}
                  <span className="text-[#1C1C1A]/60 font-medium">{addressParam}</span>
                </p>
              )}

              {displayLoading && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] p-6 animate-pulse">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-20 h-20 rounded-full bg-[#E8E3DA]" />
                        <div className="space-y-2 w-full text-center">
                          <div className="h-4 bg-[#E8E3DA] rounded w-3/4 mx-auto" />
                          <div className="h-3 bg-[#E8E3DA] rounded w-1/2 mx-auto" />
                        </div>
                        <div className="h-3 bg-[#E8E3DA] rounded w-1/4 mx-auto" />
                        <div className="h-9 bg-[#E8E3DA] rounded-lg w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {displayError && !displayLoading && (
                <div className="max-w-md mx-auto text-center bg-white rounded-xl border border-[rgba(28,28,26,0.08)] px-8 py-10">
                  <p className="text-sm text-[#1C1C1A]/60">{displayError}</p>
                </div>
              )}

              {!displayLoading && !displayError && displayRepresentatives.length === 0 && searchMode === 'name' && nameQuery.length >= 3 && (
                <p className="text-center text-sm text-[#1C1C1A]/50">No politicians found matching &ldquo;{nameQuery}&rdquo;.</p>
              )}

              {!displayLoading && !displayError && searchMode === 'address' && representatives.length === 0 && hasResults && (
                <p className="text-center text-sm text-[#1C1C1A]/50">No representatives found for this address.</p>
              )}

              {!displayLoading && !displayError && displayRepresentatives.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {displayRepresentatives.map((rep) => (
                    <RepresentativeCard
                      key={rep.id}
                      {...rep}
                      userId={userId}
                      onSignInRequired={() => router.push('/login')}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
      </main>
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
