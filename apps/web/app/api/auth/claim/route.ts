import { NextResponse, type NextRequest } from "next/server";
import { log, logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CLAIM_TOKEN_TTL_MS, mintClaimToken } from "@/lib/auth/claim";

/**
 * POST /api/auth/claim — START the email-collision claim (plan U18).
 *
 * The CURRENT session must be anonymous (a user who started anonymously and
 * is now entering an email). We mint a single-use, short-TTL token bound to
 * (this anon uid, target email) and return the raw token to THIS client.
 *
 * Crucially this attaches NOTHING: re-parenting happens only at /complete,
 * after the target email's owner authenticates. The response is uniform
 * whether or not an account exists for that email — no enumeration, and the
 * token is minted either way (the in-place conversion path handles the
 * no-account case; this collision path handles the account-exists case).
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: NextRequest) {
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Must be a CURRENT anonymous session — no anon JWT, no claim (denies the
  // "known case ID but no anon JWT" attack).
  if (!user || user.is_anonymous !== true) {
    return NextResponse.json({ error: "not_anonymous_session" }, { status: 403 });
  }

  const { token, tokenHash } = mintClaimToken();
  const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_MS).toISOString();

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("claim_tokens").insert({
    token_hash: tokenHash,
    anon_user_id: user.id,
    target_email: email,
    expires_at: expiresAt,
  });
  if (error) {
    logError("auth.claim.mint_failed", error, { route: "/api/auth/claim" });
    return NextResponse.json({ error: "claim_start_failed" }, { status: 500 });
  }

  log("auth.claim.started", { route: "/api/auth/claim" });
  // Uniform copy regardless of account existence (no enumeration).
  return NextResponse.json({
    ok: true,
    token,
    expiresAt,
    instruction:
      "To merge your bills into that account, sign in to it (or verify the email) in this browser, then confirm.",
  });
}
