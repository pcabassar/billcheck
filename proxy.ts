import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next.js 16 renamed `middleware` -> `proxy`. Refreshes the Supabase session on every request.
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // `.well-known/workflow/` is excluded so the proxy never intercepts the Workflow Development
  // Kit's internal POST /.well-known/workflow/v1/flow request (required for durable workflow
  // execution + resumption in Next 16 — see the WDK Next.js guide). Added for U6.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
