import { createHash, randomBytes } from "node:crypto";

/**
 * Account-claim decision logic (plan U18, deepening security #1), pure and
 * unit-testable. The DB mechanics (atomic re-parent + single-use consume)
 * live in the `consume_claim_token` RPC; the route is the auth boundary.
 *
 * THE invariant: anonymous data is re-parented into an existing account ONLY
 * when the target email's owner has authenticated (a non-anonymous session
 * whose email matches the token's target). An email string alone attaches
 * nothing.
 */

export const CLAIM_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Opaque token for the client; only its SHA-256 hash is ever stored. */
export function mintClaimToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashClaimToken(token) };
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ClaimTokenRow {
  anon_user_id: string;
  target_email: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface ClaimSession {
  uid: string;
  email: string | null;
  isAnonymous: boolean;
}

export type ClaimDecision =
  | { ok: true; anonUserId: string }
  | { ok: false; reason: "token_invalid" | "token_expired" | "token_consumed" | "not_authenticated" | "email_mismatch" | "same_user" };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Decide whether an authenticated session may consume a claim token. Every
 * failure returns a generic reason — the route maps ALL of them to one
 * uniform message + timing so neither account existence nor token state
 * leaks (no enumeration).
 */
export function evaluateClaim(
  tokenRow: ClaimTokenRow | null,
  session: ClaimSession,
  nowMs: number,
): ClaimDecision {
  if (!tokenRow) return { ok: false, reason: "token_invalid" };
  if (tokenRow.consumed_at !== null) return { ok: false, reason: "token_consumed" };
  if (new Date(tokenRow.expires_at).getTime() <= nowMs) return { ok: false, reason: "token_expired" };

  // The session completing the claim MUST be a real (non-anonymous) account —
  // proving ownership by authentication, not by typing an email.
  if (session.isAnonymous || !session.email) return { ok: false, reason: "not_authenticated" };
  if (normalizeEmail(session.email) !== normalizeEmail(tokenRow.target_email)) {
    return { ok: false, reason: "email_mismatch" };
  }
  // Re-parenting into the same user is a no-op that would also let an anon
  // session "claim itself" — refuse.
  if (session.uid === tokenRow.anon_user_id) return { ok: false, reason: "same_user" };

  return { ok: true, anonUserId: tokenRow.anon_user_id };
}
