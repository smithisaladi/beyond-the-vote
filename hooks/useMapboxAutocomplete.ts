'use client'

import { useState, useEffect, useRef } from 'react'
import { useDebounce } from './useDebounce'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

export function useMapboxAutocomplete(address: string) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debouncedAddress = useDebounce(address, 300)

  useEffect(() => {
    if (!MAPBOX_TOKEN || debouncedAddress.length < 3) {
      setSuggestions([])
      return
    }

    let cancelled = false
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(debouncedAddress)}.json?access_token=${MAPBOX_TOKEN}&country=US&types=address,postcode,place&autocomplete=true&limit=5`
    )
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data) return
        setSuggestions((data.features ?? []).map((f: { place_name: string }) => f.place_name))
        setShowSuggestions(true)
      })
      .catch(() => {})

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

  const clearSuggestions = () => {
    setSuggestions([])
    setShowSuggestions(false)
  }

  return { suggestions, showSuggestions, setShowSuggestions, clearSuggestions, containerRef }
}
