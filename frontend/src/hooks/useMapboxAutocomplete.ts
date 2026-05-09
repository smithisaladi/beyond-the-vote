
import { useState, useEffect, useRef } from 'react'
import { useDebounce } from './useDebounce'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''

export function useMapboxAutocomplete(address: string) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<string | null>(null)
  const debouncedAddress = useDebounce(address, 300)

  useEffect(() => {
    if (!MAPBOX_TOKEN || debouncedAddress.length < 3) {
      setSuggestions([])
      return
    }

    // Skip fetch if this address was just selected from suggestions
    if (selectedRef.current === debouncedAddress) {
      selectedRef.current = null
      return
    }

    let cancelled = false
    setError(null)
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(debouncedAddress)}.json?access_token=${MAPBOX_TOKEN}&country=US&types=address,postcode,place&autocomplete=true&limit=5`
    )
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Autocomplete request failed'))))
      .then(data => {
        if (cancelled) return
        setSuggestions((data.features ?? []).map((f: { place_name: string }) => f.place_name))
        setShowSuggestions(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Autocomplete failed')
      })

    return () => { cancelled = true }
  }, [debouncedAddress])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const clearSuggestions = (selected?: string) => {
    if (selected) selectedRef.current = selected
    setSuggestions([])
    setShowSuggestions(false)
  }

  return { suggestions, showSuggestions, setShowSuggestions, clearSuggestions, containerRef, error }
}
