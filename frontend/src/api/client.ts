// Cookie-based auth: bv_at (15min) and bv_rt (7d) are httpOnly + Secure +
// SameSite=Lax cookies issued by the Spring Boot backend. The browser sends
// them automatically when we set credentials: 'include'. The frontend never
// reads or writes the tokens directly — there's no localStorage to drain
// even if a dependency is compromised.

/** Dispatched when /api/auth/refresh fails. AuthProvider listens. */
function dispatchLogout(): void {
  window.dispatchEvent(new CustomEvent('auth:logout'))
}

/** Deduplicate parallel refresh attempts during a 401 storm. */
let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Core request function. Always sends cookies, retries once on 401 after
 * a silent refresh, dispatches `auth:logout` if refresh fails.
 */
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(path, { ...options, headers, credentials: 'include' })

  if (res.status === 401) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }
    const refreshed = await refreshPromise

    if (refreshed) {
      const retryRes = await fetch(path, { ...options, headers, credentials: 'include' })
      if (!retryRes.ok) {
        const body = await retryRes.json().catch(() => ({}))
        throw new Error((body as Record<string, string>).error ?? `Request failed: ${retryRes.status}`)
      }
      if (retryRes.status === 204) return undefined as T
      return retryRes.json() as Promise<T>
    }

    dispatchLogout()
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as Record<string, string>).error ?? `Request failed: ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'GET' })
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body != null ? JSON.stringify(body) : undefined,
    })
  },

  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PUT',
      body: body != null ? JSON.stringify(body) : undefined,
    })
  },

  del<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  },
}
