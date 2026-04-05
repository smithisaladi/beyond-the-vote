'use client'

import { useState, useEffect } from 'react'

type Party = 'Democrat' | 'Republican' | 'Independent'

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
          setError(data.error)
          setRepresentatives([])
        } else {
          setRepresentatives(data.representatives ?? [])
        }
      })
      .catch(() => setError('Failed to load representatives'))
      .finally(() => setLoading(false))
  }, [address])

  return { representatives, loading, error }
}
