import { Link } from '@tanstack/react-router'

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-[#1C1C1A]/40 mb-4">{message}</p>
        <Link
          href="/representatives"
          className="text-sm text-[#7B5E8A] hover:text-[#6A4F78]"
        >
          ← Back to representatives
        </Link>
      </div>
    </div>
  )
}
