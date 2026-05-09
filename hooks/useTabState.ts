'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface UseTabStateOptions<T extends string> {
  /** URL search param name (e.g. 'tab') */
  paramName: string
  /** Default tab when param is absent or invalid */
  defaultValue: T
  /** Allowed values — anything else falls back to defaultValue */
  validValues: T[]
}

export function useTabState<T extends string>({
  paramName,
  defaultValue,
  validValues,
}: UseTabStateOptions<T>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const raw = searchParams.get(paramName)
  const activeTab: T = validValues.includes(raw as T) ? (raw as T) : defaultValue

  const setActiveTab = useCallback(
    (tab: T) => {
      const params = new URLSearchParams(searchParams.toString())
      if (tab === defaultValue) params.delete(paramName)
      else params.set(paramName, tab)
      const qs = params.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [router, pathname, searchParams, paramName, defaultValue],
  )

  return { activeTab, setActiveTab }
}
