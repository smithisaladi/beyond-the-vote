

import * as Tooltip from '@radix-ui/react-tooltip'
import { HelpCircle } from 'lucide-react'
import { FEC_GLOSSARY, type FecTermKey } from '@/lib/fec'

type Props =
  | { term: FecTermKey; content?: never; label?: string; className?: string }
  | { term?: never; content: React.ReactNode; label: string; className?: string }

/**
 * Small `?` icon trigger that opens a tooltip with a plain-English definition
 * of an FEC term. Use `term` to pull copy from `FEC_GLOSSARY` or pass raw
 * `content` + `label` for ad-hoc text.
 *
 * Requires a single `<Tooltip.Provider>` mounted in the root layout.
 */
export function InfoTooltip({ term, content, label, className }: Props) {
  const entry = term ? FEC_GLOSSARY[term] : null
  const body = entry ? entry.body : content
  const ariaLabel = entry ? `What is ${entry.term}?` : label ?? 'More info'

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={`inline-flex items-center justify-center text-fg/38 hover:text-accent focus:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-full transition-colors ${className ?? ''}`}
        >
          <HelpCircle size={13} strokeWidth={1.8} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          align="center"
          sideOffset={4}
          collisionPadding={8}
          className="z-50 max-w-xs bg-raised rounded-lg border border-edge p-3 text-xs text-fg/75 leading-relaxed data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0"
        >
          {entry && (
            <p className="text-[11px] font-semibold text-fg mb-0.5">
              {entry.term}
            </p>
          )}
          <div>{body}</div>
          <Tooltip.Arrow className="fill-raised" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
