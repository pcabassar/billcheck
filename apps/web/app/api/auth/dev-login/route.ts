import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logError } from "@billcheck/shared";

/**
 * DEV-ONLY password login (no sign-in UI exists yet; anonymous funnel is the
 * product path). Hard-disabled outside development so it can never ship as an
 * auth bypass. Used by the E2E smoke to establish a session with proper
 * @supabase/ssr cookies.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    logError("auth.dev_login.failed", error ?? new Error("no user"), { route: "/api/auth/dev-login" });
    return NextResponse.json({ error: "login_failed" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, userId: data.user.id });
}
