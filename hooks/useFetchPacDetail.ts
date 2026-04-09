'use client'

import { useState, useEffect } from 'react'
import type { Party } from '@/lib/types'

export interface PacDetailRecipient {
  bioguideId: string
  name: string
  party: Party
  state: string
  chamber: string
  amount: number
  direct: number
  ieFor: number
}

export interface PacDetail {
  cmteId: string
  name: string
  connectedOrg: string | null
  totalContributions: number
  directTotal: number
  ieForTotal: number
  ieAgainstTotal: number
  recipientCount: number
  recipients: PacDetailRecipient[]
  summary: string
}

export function useFetchPacDetail(cmteId: string) {
  const [pac, setPac] = useState<PacDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/donors/${encodeURIComponent(cmteId)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load PAC details')
        if (!cancelled) setPac(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load PAC details')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [cmteId])

  return { pac, loading, error }
}
