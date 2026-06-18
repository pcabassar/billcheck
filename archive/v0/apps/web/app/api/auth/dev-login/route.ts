import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logError } from "@billcheck/shared";

/**
 * DEV-ONLY password login (no sign-in UI exists yet; anonymous funnel is the
 * product path). Hard-disabled outside development so it can never ship as an
 * auth bypass. Used by the E2E smoke and the /dev driver page.
 *
 * Credentials live in env (DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD) — NEVER in
 * code, and never in a client bundle (review F17: the old flow shipped the
 * test-account password to every browser, where it worked against Supabase
 * auth directly in any environment).
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }
  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ error: "dev_login_not_configured" }, { status: 503 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    logError("auth.dev_login.failed", error ?? new Error("no user"), { route: "/api/auth/dev-login" });
    return NextResponse.json({ error: "login_failed" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, userId: data.user.id });
}
