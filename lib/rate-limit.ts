const windows = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(ip: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = windows.get(ip)
  if (!entry || now > entry.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= limit
}
