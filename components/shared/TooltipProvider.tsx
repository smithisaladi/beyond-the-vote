'use client'

import * as Tooltip from '@radix-ui/react-tooltip'

/**
 * Single Radix Tooltip provider mounted once in the root layout so that every
 * <InfoTooltip> across the app shares consistent timing. Kept as its own
 * client component so the root layout can stay a Server Component.
 */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
      {children}
    </Tooltip.Provider>
  )
}
