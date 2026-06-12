import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { CARD_CLASS, CARD_LIGHT_BORDER_CLASS, CARD_HOVER_CLASS } from '@/lib/ui'

type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl'
type CardBorder = 'standard' | 'light' | 'none'

const PADDING_MAP: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-12',
}

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Rendered element. Defaults to `div`. */
  as?: ElementType
  /** Padding token. Use `none` when you need custom padding via `className`. */
  padding?: CardPadding
  /** Border style. `standard` uses the surface background; `light` uses a lighter border; `none` uses `bg-surface`. */
  border?: CardBorder
  /** Add hover elevation. Must be placed inside a `group` wrapper. */
  hoverable?: boolean
  children?: ReactNode
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/**
 * Standard card primitive. Defaults: `padding="lg"` (p-6), `border="standard"`. No shadows — elevation is expressed via background steps.
 * Pass `className` to extend (e.g., extra margin, custom padding, overflow controls).
 */
export function Card({
  as: Tag = 'div',
  padding = 'lg',
  border = 'standard',
  hoverable = false,
  className,
  children,
  ...rest
}: CardProps) {
  const borderClass =
    border === 'light' ? CARD_LIGHT_BORDER_CLASS :
    border === 'none'  ? 'bg-surface rounded-xl' :
                         CARD_CLASS
  return (
    <Tag
      className={joinClasses(
        borderClass,
        hoverable ? CARD_HOVER_CLASS : null,
        PADDING_MAP[padding],
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
