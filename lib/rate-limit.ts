const windows = new Map<string, { count: number; resetAt: number }>()

let callCount = 0
const CLEANUP_INTERVAL = 100

function cleanup(now: number) {
  for (const [key, entry] of windows) {
    if (now > entry.resetAt) {
      windows.delete(key)
    }
  }
}

export function rateLimit(ip: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now()

  if (++callCount % CLEANUP_INTERVAL === 0) {
    cleanup(now)
  }

  const entry = windows.get(ip)
  if (!entry || now > entry.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= limit
}
