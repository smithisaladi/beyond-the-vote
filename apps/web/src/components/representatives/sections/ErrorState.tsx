import { Link } from '@tanstack/react-router'

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-fg/40 mb-4">{message}</p>
        <Link
          to="/representatives"
          className="text-sm text-accent hover:text-accent/80"
        >
          ← Back to representatives
        </Link>
      </div>
    </div>
  )
}
