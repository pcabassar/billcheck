import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The authorization layer (plan U3, review S1). RLS is the backstop, not the
 * primary gate:
 *  - Validates the Supabase session on every protected route.
 *  - Enforces Origin-matches-Host on all state-mutating requests (App Router
 *    API routes get no automatic CSRF protection).
 * AI-invoking actions are login-gated from day 1 (public URL decision).
 */

// /api/cron/* and /api/jobs/* are secret-gated inside the route (pg_net has
// no session); /api/webhooks/* is signature-verified inside the route (Stripe
// is server-to-server, no session); /.well-known/workflow + /_workflow cover
// WDK runtime callbacks.
const PUBLIC_PATHS = ["/", "/dev", "/api/auth", "/api/health", "/api/cron", "/api/jobs", "/api/webhooks", "/.well-known/workflow", "/_workflow"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF: Origin must match Host on every mutation, public or not.
  if (MUTATING.has(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return NextResponse.json({ error: "bad_origin" }, { status: 403 });
      }
      if (originHost !== host) {
        return NextResponse.json({ error: "origin_mismatch" }, { status: 403 });
      }
    }
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Session validation + token refresh (Supabase SSR pattern).
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
