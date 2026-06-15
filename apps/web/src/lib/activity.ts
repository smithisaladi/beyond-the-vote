import type { ActivityItem } from '@/lib/types'

export type ActivityTab = 'all' | 'bills' | 'votes'

/** Build an isNew predicate from the server's last-seen timestamp. */
export function makeIsNew(lastSeenAt: string | null): (timestamp: number) => boolean {
  const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN
  if (Number.isNaN(lastSeenMs)) return () => false
  return (timestamp: number) => timestamp > lastSeenMs
}

export function filterActivityByTab(items: ActivityItem[], tab: ActivityTab): ActivityItem[] {
  return items.filter(item => {
    if (tab === 'votes') return item.politician !== null
    if (tab === 'bills') return item.politician === null
    return true
  })
}
