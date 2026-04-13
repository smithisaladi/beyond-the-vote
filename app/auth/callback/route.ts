import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * OAuth / magic-link callback handler.
 *
 * Supabase Auth redirects back to this route after the user completes an
 * authentication flow (Google OAuth, email confirmation, password reset,
 * etc.). The URL carries a short-lived `code` that we exchange for a
 * session and persist in cookies so subsequent server components see the
 * user as authenticated.
 *
 * Flow:
 *   1. Extract `code` and optional `next` redirect target from the URL.
 *   2. Exchange the code for a session using the server-side Supabase client.
 *   3. On success → redirect to `next` (or `/`).
 *   4. On failure → redirect to `/?error=...` so the landing page can surface
 *      a toast. We avoid redirecting to `/sign-in` because this app uses a
 *      modal sign-in rather than a dedicated page.
 *
 * Security notes:
 *   - The `code` is single-use and bound to the PKCE verifier stored in the
 *     user's cookies — it cannot be replayed.
 *   - We return `NextResponse.redirect` (302) rather than rendering HTML so
 *     the intermediate URL (which contains the code) does not get cached.
 *   - `next` is intentionally treated as path-only; open-redirect attacks
 *     would require a full URL, which we strip below.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Only allow same-origin redirects. Anything starting with something other
  // than a single "/" is rewritten to "/" to prevent open-redirect abuse.
  const rawNext = searchParams.get('next') ?? '/'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    // Never echo the raw Supabase error back in the URL — it can contain
    // internal identifiers. A stable, generic code is enough for the UI.
    return NextResponse.redirect(`${origin}/?error=auth_failed`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
