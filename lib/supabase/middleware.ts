import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Refresh the Supabase session on every request and gate unauthenticated page access. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // IMPORTANT: refresh + read claims with no code in between (per @supabase/ssr guidance).
  const { data } = await supabase.auth.getClaims()
  const authed = !!data?.claims

  const path = request.nextUrl.pathname
  // PUBLIC pages reachable signed-out: the auth screens AND the privacy policy (U12 — MHMDA
  // requires the consumer-health privacy policy be reachable before/without an account).
  // The auth SCREENS (an authed user gets bounced home from these).
  const isAuthScreen = path === '/login' || path === '/signup' || path.startsWith('/auth')
  // PUBLIC pages reachable signed-out = the auth screens PLUS the privacy policy (U12 — MHMDA
  // requires the consumer-health privacy policy be reachable before/without an account). Note
  // /privacy is public but NOT an auth screen, so an authed user can still read it.
  const isPublicPage = isAuthScreen || path === '/privacy'
  const isApi = path.startsWith('/api') // API routes enforce auth in-handler (401, not redirect)

  if (!authed && !isPublicPage && !isApi) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (authed && isAuthScreen) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return response
}
