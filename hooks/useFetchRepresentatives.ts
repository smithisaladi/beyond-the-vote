'use client'

import { useState, useEffect } from 'react'
import type { Party } from '@/lib/types'

export interface Representative {
  id: string
  bioguideId: string | null
  name: string
  title: string
  party: Party
  state: string
  district?: string
  photo: string | null
  since: string | null
  website: string | null
  phone: string | null
  ideologyScore?: number | null
}

const ERROR_MESSAGES: Record<string, string> = {
  address_not_found: "We couldn't find that address. Try including your city and zip code.",
  no_legislators: "This address doesn't appear to have voting federal representatives. Some US territories have non-voting delegates.",
  geocode_failed: 'Something went wrong. Please try again.',
}

export function useFetchRepresentatives(address: string) {
  const [representatives, setRepresentatives] = useState<Representative[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!address) {
      setRepresentatives([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/representatives?address=${encodeURIComponent(address)}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (controller.signal.aborted) return
        if (data.error) {
          setError(ERROR_MESSAGES[data.error] ?? ERROR_MESSAGES.geocode_failed)
          setRepresentatives([])
        } else {
          setRepresentatives(data.representatives ?? [])
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(ERROR_MESSAGES.geocode_failed)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [address])

  return { representatives, loading, error }
}
