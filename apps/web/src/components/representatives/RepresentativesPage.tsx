

import { useState, useEffect, useRef, Suspense } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Search, MapPin, User } from 'lucide-react'
import { RepresentativeCard } from '@/components/representatives/RepresentativeCard'
import { useAuthModal } from '@/components/auth/AuthModalContext'
import { useMapboxAutocomplete } from '@/hooks/useMapboxAutocomplete'
import { useRepresentatives } from '@/hooks/queries/useRepresentatives'
import { useSearchPoliticians } from '@/hooks/queries/usePoliticians'
import { useAuth } from '@/components/auth/AuthContext'
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

function RepresentativesContent() {
  const navigate = useNavigate()
  const searchParams = useSearch({ strict: false }) as Record<string, string>
  const addressParam = searchParams['address'] ?? ''

  const nameParam = searchParams['name'] ?? ''
  const modeParam = searchParams['mode']

  const [address, setAddress] = useState(addressParam)
  const [inputFocused, setInputFocused] = useState(false)
  const [searchMode, setSearchMode] = useState<'address' | 'name'>(modeParam === 'address' ? 'address' : 'name')
  const [nameQuery, setNameQuery] = useState(nameParam)
  const { openSignIn } = useAuthModal()
  const hasResults = addressParam.length > 0

  // Resolve display address (shortened form for the input after submission)
  const inputDisplayValue = address

  const { user } = useAuth()
  const userId = user?.id ?? null

  // Sync input with URL param
  useEffect(() => {
    setAddress(addressParam)
  }, [addressParam])

  // Sync search mode with URL
  useEffect(() => {
    if (modeParam === 'address' && searchMode !== 'address') setSearchMode('address')
    if (modeParam === 'name' && searchMode !== 'name') setSearchMode('name')
  }, [modeParam])

  const { data: representatives = [], isLoading: loading, error: _repError } = useRepresentatives(addressParam)
  const error = _repError ? String(_repError) : ''
  const suggestions = useMapboxAutocomplete(address)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: nameResults = [], isLoading: nameLoading } = useSearchPoliticians(nameQuery)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setShowSuggestions(false)
    if (address.trim()) {
      navigate({ to: '/representatives', search: { address: address.trim(), mode: 'address' } as any })
    }
  }

  const handleSelectSuggestion = (suggestion: string) => {
    setAddress(suggestion)
    setShowSuggestions(false)
    navigate({ to: '/representatives', search: { address: suggestion, mode: 'address' } as any })
  }

  // Displayed results depend on mode
  const displayRepresentatives = searchMode === 'name' ? nameResults : representatives
  const displayLoading = searchMode === 'name' ? nameLoading : loading
  const displayError = searchMode === 'name' ? '' : error
  const displayHasResults = searchMode === 'name' ? nameResults.length > 0 || nameLoading || nameQuery.length >= 3 : hasResults

  return (
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-reps" />

      <main className="relative z-10 flex-1 px-6 pt-24 pb-8">
          {/* Search */}
          <div className="max-w-4xl mx-auto mb-10">
            {/* Page heading */}
            <div className="mb-5 text-center">
              <h1
                className="text-2xl sm:text-3xl text-[#1C1C1A] mb-1.5"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
              >
                Find a Politician
              </h1>
              <p className="text-sm text-[#1C1C1A]/50">
                {searchMode === 'name'
                  ? 'Search any current U.S. Senator or House Representative.'
                  : 'Enter your home address to find your federal representatives.'
                }
              </p>
            </div>

            {/* Unified search control */}
            <Card padding="none">
              {/* Integrated tabs */}
              <div className="flex border-b border-[rgba(28,28,26,0.06)]">
                <button
                  onClick={() => setSearchMode('name')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative ${
                    searchMode === 'name'
                      ? 'text-[#1C1C1A] after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:bg-[#7B5E8A] after:rounded-t-full'
                      : 'text-[#1C1C1A]/40 hover:text-[#1C1C1A]/65'
                  }`}
                >
                  <User size={15} strokeWidth={1.8} />
                  Name
                </button>
                <div className="w-px bg-[rgba(28,28,26,0.06)]" />
                <button
                  onClick={() => setSearchMode('address')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative ${
                    searchMode === 'address'
                      ? 'text-[#1C1C1A] after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:bg-[#7B5E8A] after:rounded-t-full'
                      : 'text-[#1C1C1A]/40 hover:text-[#1C1C1A]/65'
                  }`}
                >
                  <MapPin size={15} strokeWidth={1.8} />
                  Address
                </button>
              </div>

              {/* Search input */}
              {searchMode === 'address' ? (
                <div className="relative" ref={containerRef}>
                  <form onSubmit={handleSubmit}>
                    <div className="flex items-center px-5 py-4 gap-3">
                      <Search size={17} strokeWidth={1.8} className="text-[#1C1C1A]/25 flex-shrink-0" />
                      <input
                        type="text"
                        value={inputDisplayValue}
                        onChange={(e) => { setAddress(e.target.value); setShowSuggestions(true) }}
                        onFocus={() => { setInputFocused(true); suggestions.length > 0 && setShowSuggestions(true) }}
                        onBlur={() => { setInputFocused(false); setTimeout(() => setShowSuggestions(false), 200) }}
                        placeholder="Enter your home address"
                        className="flex-1 bg-transparent outline-none text-[15px] text-[#1C1C1A] placeholder:text-[#1C1C1A]/35"
                        autoComplete="off"
                      />
                    </div>
                  </form>

                  {/* Autocomplete dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-[rgba(28,28,26,0.12)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden z-20">
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
              ) : (
                <div className="relative">
                  <div className="flex items-center px-5 py-4 gap-3">
                    <Search size={17} strokeWidth={1.8} className="text-[#1C1C1A]/25 flex-shrink-0" />
                    <input
                      type="text"
                      value={nameQuery}
                      onChange={(e) => setNameQuery(e.target.value)}
                      placeholder="Search by name"
                      className="flex-1 bg-transparent outline-none text-[15px] text-[#1C1C1A] placeholder:text-[#1C1C1A]/35"
                      autoComplete="off"
                      autoFocus
                    />
                    {nameQuery.length > 0 && nameQuery.length < 3 && (
                      <span className="text-xs text-[#1C1C1A]/32 flex-shrink-0">3 characters min</span>
                    )}
                  </div>
                </div>
              )}
            </Card>

          </div>

          {/* Results */}
          {displayHasResults && (
            <div className="max-w-4xl mx-auto">
              {hasResults && searchMode === 'address' && (
                <p className="text-xs text-[#1C1C1A]/38 mb-5">
                  Results for <span className="text-[#1C1C1A]/55 font-medium">{addressParam}</span>
                </p>
              )}

              {displayLoading && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {[1, 2, 3].map(i => (
                    <Card key={i} padding="md" shadow={false} className="animate-pulse">
                      <div className="flex flex-col items-center gap-3">
                        <Skeleton className="w-20 h-24 rounded-full" />
                        <div className="space-y-1.5 w-full text-center">
                          <Skeleton className="h-4 w-3/4 mx-auto" />
                          <Skeleton className="h-3 w-1/2 mx-auto" />
                        </div>
                        <Skeleton className="h-3 w-2/5 mx-auto" />
                        <Skeleton className="h-7 rounded-lg w-full" />
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {displayError && !displayLoading && (
                <Card shadow={false} padding="none" className="max-w-md mx-auto text-center px-8 py-10">
                  <p className="text-sm text-[#1C1C1A]/60">{displayError}</p>
                </Card>
              )}

              {!displayLoading && !displayError && displayRepresentatives.length === 0 && searchMode === 'name' && nameQuery.length >= 3 && (
                <p className="text-center text-sm text-[#1C1C1A]/50 py-8">No politicians found matching &ldquo;{nameQuery}&rdquo;</p>
              )}

              {!displayLoading && !displayError && searchMode === 'address' && representatives.length === 0 && hasResults && (
                <p className="text-center text-sm text-[#1C1C1A]/50 py-8">No representatives found for this address</p>
              )}

              {!displayLoading && !displayError && displayRepresentatives.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {displayRepresentatives.map((rep: any) => (
                    <RepresentativeCard
                      key={rep.id}
                      {...rep}
                      userId={userId}
                      onSignInRequired={openSignIn}
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
