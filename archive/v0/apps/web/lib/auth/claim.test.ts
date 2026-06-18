import { describe, expect, it } from "vitest";
import {
  evaluateClaim,
  hashClaimToken,
  mintClaimToken,
  type ClaimSession,
  type ClaimTokenRow,
} from "./claim";

const NOW = Date.UTC(2026, 6, 1, 12, 0, 0);
const FUTURE = new Date(NOW + 60_000).toISOString();
const PAST = new Date(NOW - 60_000).toISOString();

function token(over: Partial<ClaimTokenRow> = {}): ClaimTokenRow {
  return { anon_user_id: "anon-1", target_email: "owner@example.com", expires_at: FUTURE, consumed_at: null, ...over };
}
function session(over: Partial<ClaimSession> = {}): ClaimSession {
  return { uid: "target-1", email: "owner@example.com", isAnonymous: false, ...over };
}

describe("mint/hash claim token", () => {
  it("mints an opaque token and stores only its hash", () => {
    const { token: raw, tokenHash } = mintClaimToken();
    expect(raw).not.toEqual(tokenHash);
    expect(tokenHash).toBe(hashClaimToken(raw));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("mints unique tokens", () => {
    expect(mintClaimToken().token).not.toBe(mintClaimToken().token);
  });
});

describe("evaluateClaim — the re-parent gate", () => {
  it("allows when an authenticated owner's email matches the token", () => {
    expect(evaluateClaim(token(), session(), NOW)).toEqual({ ok: true, anonUserId: "anon-1" });
  });

  it("email match is case/whitespace-insensitive", () => {
    expect(evaluateClaim(token({ target_email: "Owner@Example.com" }), session({ email: " owner@example.com " }), NOW).ok).toBe(true);
  });

  it("DENIES an anonymous session (ownership must be proven by auth, not a typed email)", () => {
    const d = evaluateClaim(token(), session({ isAnonymous: true }), NOW);
    expect(d).toEqual({ ok: false, reason: "not_authenticated" });
  });

  it("DENIES when the authenticated email differs from the token target (someone else's email attaches nothing)", () => {
    const d = evaluateClaim(token(), session({ email: "attacker@evil.com" }), NOW);
    expect(d).toEqual({ ok: false, reason: "email_mismatch" });
  });

  it("DENIES a consumed token (single-use)", () => {
    expect(evaluateClaim(token({ consumed_at: PAST }), session(), NOW).ok).toBe(false);
  });

  it("DENIES an expired token", () => {
    expect(evaluateClaim(token({ expires_at: PAST }), session(), NOW)).toEqual({ ok: false, reason: "token_expired" });
  });

  it("DENIES a missing token (unknown hash)", () => {
    expect(evaluateClaim(null, session(), NOW)).toEqual({ ok: false, reason: "token_invalid" });
  });

  it("DENIES claiming into the same user (an anon session can't claim itself)", () => {
    const d = evaluateClaim(token({ anon_user_id: "target-1" }), session({ uid: "target-1" }), NOW);
    expect(d).toEqual({ ok: false, reason: "same_user" });
  });

  it("DENIES a session with no email even if non-anonymous", () => {
    expect(evaluateClaim(token(), session({ email: null }), NOW).ok).toBe(false);
  });
});
