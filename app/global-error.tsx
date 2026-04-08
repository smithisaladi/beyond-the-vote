'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#F5F0E8', fontFamily: 'Inter, sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 72, fontWeight: 700, color: 'rgba(155,127,166,0.2)', lineHeight: 1, marginBottom: 8, userSelect: 'none' }}>
            500
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1C1C1A', marginBottom: 10, marginTop: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(28,28,26,0.55)', marginBottom: 28, lineHeight: 1.6 }}>
            An unexpected error occurred. Please try again.
            {error.digest && (
              <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'rgba(28,28,26,0.35)', fontFamily: 'monospace' }}>
                Error ID: {error.digest}
              </span>
            )}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={reset}
              style={{
                padding: '10px 20px',
                background: '#9B7FA6',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: '#1C1C1A',
                border: '1px solid rgba(28,28,26,0.2)',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
