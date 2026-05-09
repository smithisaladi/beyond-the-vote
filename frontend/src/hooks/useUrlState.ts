
import { useEffect } from 'react'

/**
 * Syncs a record of key-value pairs to the URL query string via
 * `window.history.replaceState`. Values that are `null` or `undefined`
 * are omitted from the URL.
 *
 * @param params - Record of param names to their string values (or null to omit)
 * @param deps   - React dependency array that triggers a URL update
 */
export function useUrlState(
  params: Record<string, string | null | undefined>,
  deps: React.DependencyList,
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sp = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== '') {
        sp.set(key, value)
      }
    }
    const qs = sp.toString()
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`
    if (newUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', newUrl)
    }
  }, deps)
}
