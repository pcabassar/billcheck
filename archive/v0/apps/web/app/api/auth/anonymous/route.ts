import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log, logError } from "@billcheck/shared";

/**
 * Anonymous session start (plan U3 / spec S1→S2): the user begins without an
 * account; in-place conversion to a permanent account happens at triage (S4),
 * keeping the same auth.uid() so RLS ownership holds. Anonymous sessions and
 * their documents are purged after 30 days of inactivity (U17).
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  // Reuse an existing session rather than minting a new anonymous user.
  const {
    data: { user: existing },
  } = await supabase.auth.getUser();
  if (existing) {
    return NextResponse.redirect(new URL("/bills", request.url), 303);
  }

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    logError("auth.anonymous.failed", error, { route: "/api/auth/anonymous" });
    return NextResponse.json({ error: "auth_failed" }, { status: 500 });
  }
  log("auth.anonymous.started", { route: "/api/auth/anonymous" });
  return NextResponse.redirect(new URL("/bills", request.url), 303);
}
