import type { HTMLAttributes } from 'react'
import { SKELETON_BG } from '@/lib/ui'

/**
 * Placeholder shape used inside loading states. Pair with an ancestor `animate-pulse`.
 * Pass sizing/shape classes via `className` (e.g., `"h-4 w-24 rounded-full"`).
 */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[SKELETON_BG, 'rounded', className].filter(Boolean).join(' ')} {...rest} />
}
