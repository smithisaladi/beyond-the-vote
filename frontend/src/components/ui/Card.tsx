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
  /** Border style. `standard` includes the soft shadow; `light` and `none` omit it. */
  border?: CardBorder
  /** Override the default shadow of the `standard` border. */
  shadow?: boolean
  /** Add hover elevation. Must be placed inside a `group` wrapper. */
  hoverable?: boolean
  children?: ReactNode
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/**
 * Standard card primitive. Defaults: `padding="lg"` (p-6), `border="standard"`, shadow on.
 * Pass `className` to extend (e.g., extra margin, custom padding, overflow controls).
 */
export function Card({
  as: Tag = 'div',
  padding = 'lg',
  border = 'standard',
  shadow = true,
  hoverable = false,
  className,
  children,
  ...rest
}: CardProps) {
  const borderClass =
    border === 'light' ? CARD_LIGHT_BORDER_CLASS :
    border === 'none'  ? 'bg-white rounded-xl' :
                         CARD_CLASS
  const shadowOff = border === 'standard' && !shadow ? '!shadow-none' : null
  return (
    <Tag
      className={joinClasses(
        borderClass,
        shadowOff,
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
