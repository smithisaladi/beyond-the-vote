// lib/integrations/senate-votes/sessions.ts

/** Senate roll-call sessions to probe, most-recent first. */
export function senateSessions(): { congress: number; session: number }[] {
  const year = new Date().getFullYear()
  if (year >= 2026) return [{ congress: 119, session: 2 }, { congress: 119, session: 1 }]
  if (year === 2025) return [{ congress: 119, session: 1 }]
  if (year === 2024) return [{ congress: 118, session: 2 }, { congress: 118, session: 1 }]
  return [{ congress: 119, session: 1 }]
}
