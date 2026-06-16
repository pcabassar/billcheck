import { NextResponse, type NextRequest } from "next/server";
import { log, logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { evaluateClaim, hashClaimToken, type ClaimTokenRow } from "@/lib/auth/claim";

/**
 * POST /api/auth/claim/complete — CONSUME the claim (plan U18).
 *
 * By now the user has authenticated as the target account (the client holds
 * that session). We verify the authenticated session's email matches the
 * token's target — the proof of ownership — then atomically re-parent the
 * anon user's cases into this account and delete the anon user.
 *
 * Uniform failure: every rejection returns one generic error + a fixed
 * minimum latency, so neither token state nor account existence leaks.
 */
const UNIFORM_DELAY_MS = 400;

async function uniformFail(startedMs: number): Promise<NextResponse> {
  const elapsed = Date.now() - startedMs;
  if (elapsed < UNIFORM_DELAY_MS) {
    await new Promise((r) => setTimeout(r, UNIFORM_DELAY_MS - elapsed));
  }
  return NextResponse.json({ error: "claim_failed" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return uniformFail(started);
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (token.length === 0) return uniformFail(started);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return uniformFail(started);

  const admin = createSupabaseAdminClient();
  const tokenHash = hashClaimToken(token);
  const { data: rows, error: lookupErr } = await admin
    .from("claim_tokens")
    .select("anon_user_id, target_email, expires_at, consumed_at")
    .eq("token_hash", tokenHash)
    .limit(1);
  if (lookupErr) {
    logError("auth.claim.lookup_failed", lookupErr, { route: "/api/auth/claim/complete" });
    return uniformFail(started);
  }

  const decision = evaluateClaim(
    (rows?.[0] as ClaimTokenRow | undefined) ?? null,
    { uid: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous === true },
    Date.now(),
  );
  if (!decision.ok) {
    log("auth.claim.denied", { route: "/api/auth/claim/complete", status: decision.reason });
    return uniformFail(started);
  }

  // Atomic single-use re-parent (the RPC re-checks token validity under a
  // row lock, so two racing completes can't both move the data).
  const { data: moved, error: consumeErr } = await admin.rpc("consume_claim_token", {
    p_token_hash: tokenHash,
    p_target_uid: user.id,
  });
  if (consumeErr || typeof moved !== "number" || moved < 0) {
    logError(
      "auth.claim.consume_failed",
      consumeErr ?? new Error("token_unconsumable"),
      { route: "/api/auth/claim/complete" },
    );
    return uniformFail(started);
  }

  // Delete the now case-less anonymous user; its sessions die with it.
  const { error: delErr } = await admin.auth.admin.deleteUser(decision.anonUserId);
  if (delErr) {
    // Rows already moved (the merge succeeded) — the orphan anon user is
    // harmless and the purge job will collect it. Log, don't fail the merge.
    logError("auth.claim.anon_delete_failed", delErr, { route: "/api/auth/claim/complete" });
  }

  log("auth.claim.completed", { route: "/api/auth/claim/complete", count: moved });
  return NextResponse.json({ ok: true, casesMerged: moved });
}
