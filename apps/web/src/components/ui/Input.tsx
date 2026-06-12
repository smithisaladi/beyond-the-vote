import type { InputHTMLAttributes } from 'react'

const INPUT_CLASS =
  'bg-bg border border-edge rounded-lg px-3 py-1.5 text-[13px] text-fg placeholder:text-fg/38 ' +
  'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 ' +
  'disabled:bg-fg/[0.04] disabled:text-fg/45 transition-colors'

/** Dark form input. Pass sizing via `className`. */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[INPUT_CLASS, className].filter(Boolean).join(' ')} {...rest} />
}
