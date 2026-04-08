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
    setLoading(true)
    setError('')
    fetch(`/api/representatives?address=${encodeURIComponent(address)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(ERROR_MESSAGES[data.error] ?? ERROR_MESSAGES.geocode_failed)
          setRepresentatives([])
        } else {
          setRepresentatives(data.representatives ?? [])
        }
      })
      .catch(() => setError(ERROR_MESSAGES.geocode_failed))
      .finally(() => setLoading(false))
  }, [address])

  return { representatives, loading, error }
}
