import { SKELETON_BG } from '@/lib/ui'

export function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2
    ? `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`
    : parts[0]?.[0] ?? '?'
  return (
    <div className={`w-24 h-24 rounded-full ${SKELETON_BG} flex items-center justify-center flex-shrink-0`}>
      <span className="text-2xl text-fg/50 font-medium tracking-tight">
        {initials.toUpperCase()}
      </span>
    </div>
  )
}
