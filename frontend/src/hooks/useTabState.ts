
import { useCallback } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'

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
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()

  const raw = searchParams.get(paramName)
  const activeTab: T = validValues.includes(raw as T) ? (raw as T) : defaultValue

  const setActiveTab = useCallback(
    (tab: T) => {
      const params = new URLSearchParams(searchParams.toString())
      if (tab === defaultValue) params.delete(paramName)
      else params.set(paramName, tab)
      const qs = params.toString()
      navigate(`${pathname}${qs ? `?${qs}` : ''}`, { replace: true })
    },
    [navigate, pathname, searchParams, paramName, defaultValue],
  )

  return { activeTab, setActiveTab }
}
