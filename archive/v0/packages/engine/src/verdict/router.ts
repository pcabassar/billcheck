import type { CoverageEntry, VerdictKind } from "@billcheck/shared";

/**
 * D10 verdict router v0.2 (plan U12). Deterministic cascade:
 *   premise → status gates → fights → affordability → pay gates.
 *
 * Verdicts STACK: one primary + tracks ordered by statutory urgency (the
 * track with the shortest legal clock comes first). The router never sees
 * document text — only typed findings, triage flags, and the coverage map.
 *
 * V0 honesty gates (ratified):
 *  - PAY requires (a) an itemized bill, (b) C3/C4/C5/C10 all RAN, and
 *    (c) zero actionable findings and zero tracks. Summary bills route to
 *    GET_ITEMIZED regardless — never PAY.
 *  - Partial battery + clean → CLEAN_PARTIAL ("no issues in the N checks we
 *    could run" + what would unlock the rest), never "this bill checks out".
 *  - NEGOTIATE/REDUCE never assert dollar amounts (their findings carry
 *    null impacts by engine contract).
 */
export const ROUTER_VERSION = "d10-0.2";

/** Triage-derived routing flags (subset the router consumes; all default false). */
export interface RouterFlags {
  wait?: boolean;
  validate?: boolean;
  appeal?: boolean;
  rejectPremise?: boolean;
  otherPayerGuidance?: boolean;
}

export interface RouterFinding {
  checkId: string;
  confidenceTier: "high" | "medium" | "review";
  amountImpactCents: number | null;
}

export interface RouterInput {
  itemized: boolean;
  flags: RouterFlags;
  findings: RouterFinding[];
  coverage: CoverageEntry[];
}

export interface VerdictTrack {
  kind: VerdictKind;
  /** Honest one-liner for the action plan. */
  reason: string;
  /** Statutory clock copy, or null when no legal deadline drives it. */
  deadlineNote: string | null;
  /** Lower = more urgent; tracks render in this order. */
  urgency: number;
}

export interface RouterResult {
  primary: VerdictKind;
  stacked: VerdictTrack[];
  /** Renderable, honest reasons behind the primary verdict. */
  rationale: string[];
  /** What would arm the checks that skipped (S11c unlock list). */
  unlocks: string[];
}

/** Checks whose findings represent contestable billing errors. */
const CONTEST_CHECKS = new Set(["C1", "C2", "C3", "C4", "C5", "C6", "C13"]);
/** The PAY gate's required battery (deepening: coherence decision). */
const PAY_REQUIRED_CHECKS = ["C3", "C4", "C5", "C10"] as const;

export function routeVerdict(input: RouterInput): RouterResult {
  const flags = input.flags;
  const findingsBy = (pred: (f: RouterFinding) => boolean) => input.findings.filter(pred);

  const contestFindings = findingsBy(
    (f) => CONTEST_CHECKS.has(f.checkId) && f.confidenceTier !== "review",
  );
  const gfeBreach = findingsBy((f) => f.checkId === "C8");
  const fapFindings = findingsBy((f) => f.checkId === "C9");
  const anchorFindings = findingsBy((f) => f.checkId === "C10");
  const paymentFindings = findingsBy((f) => f.checkId === "C13");

  const disputedCents = contestFindings.reduce(
    (sum, f) => sum + (f.amountImpactCents ?? 0),
    0,
  );

  // ---- assemble tracks (urgency = statutory-clock order)
  const tracks: VerdictTrack[] = [];
  if (flags.rejectPremise && paymentFindings.length > 0) {
    tracks.push({
      kind: "REJECT",
      reason: "Your receipts show payments this bill doesn't credit — its premise is wrong before any line is examined.",
      deadlineNote: null,
      urgency: 0,
    });
  }
  if (flags.validate) {
    tracks.push({
      kind: "VALIDATE",
      reason: "A collector is involved: demand debt validation in writing before anything else.",
      deadlineNote: "FDCPA: you have 30 days from the collector's FIRST written notice — this clock outranks everything.",
      urgency: 1,
    });
  }
  if (flags.appeal) {
    tracks.push({
      kind: "APPEAL",
      reason: "Your insurance denied a claim — appealing the denial usually moves more dollars than disputing line items.",
      deadlineNote: "Plan appeal windows are typically 60–180 days from the denial date — find your denial letter.",
      urgency: 2,
    });
  }
  if (contestFindings.length > 0 || gfeBreach.length > 0) {
    const ppdr = gfeBreach.length > 0;
    tracks.push({
      kind: "CONTEST",
      reason:
        contestFindings.length > 0
          ? `The audit found ${contestFindings.length} billing error${contestFindings.length === 1 ? "" : "s"} worth disputing.`
          : "Your bill exceeds the written estimate past the federal trigger.",
      deadlineNote: ppdr
        ? "Federal Patient-Provider Dispute Resolution: file within 120 days of the bill date."
        : null,
      urgency: ppdr ? 2.5 : 3,
    });
  }
  if (fapFindings.length > 0) {
    tracks.push({
      kind: "REDUCE",
      reason: "You likely qualify under the hospital's published financial-assistance policy — apply regardless of the dispute.",
      deadlineNote: "IRS rules keep FAP applications open at least 240 days from the first bill.",
      urgency: 4,
    });
  }
  if (anchorFindings.length > 0 && contestFindings.length === 0) {
    tracks.push({
      kind: "NEGOTIATE",
      reason: "No billing errors found, but charges run well above the Medicare benchmark — that's your negotiation anchor.",
      deadlineNote: null,
      urgency: 5,
    });
  }
  if (flags.wait) {
    tracks.push({
      kind: "WAIT",
      reason: "Your insurance hasn't processed this bill — the EOB unlocks the strongest insured-bill checks.",
      deadlineNote: null,
      urgency: 1.5,
    });
  }
  tracks.sort((a, b) => a.urgency - b.urgency);

  // ---- primary selection (cascade)
  const rationale: string[] = [];
  let primary: VerdictKind;

  const take = (kind: VerdictKind): VerdictTrack[] => tracks.filter((t) => t.kind !== kind);

  if (flags.rejectPremise && paymentFindings.length > 0) {
    primary = "REJECT";
    rationale.push("Premise check failed: documented payments aren't credited on this bill.");
    return { primary, stacked: take("REJECT"), rationale, unlocks: unlocksFrom(input) };
  }
  if (flags.wait) {
    primary = "WAIT";
    rationale.push(
      "Insurance hasn't adjudicated yet. We audited what we could, but don't pay or contest until the EOB lands.",
    );
    return { primary, stacked: take("WAIT"), rationale, unlocks: unlocksFrom(input) };
  }
  if (flags.validate) {
    primary = "VALIDATE";
    rationale.push("The collector's 30-day validation window is the shortest legal clock on this bill.");
    return { primary, stacked: take("VALIDATE"), rationale, unlocks: unlocksFrom(input) };
  }
  if (!input.itemized) {
    primary = "GET_ITEMIZED";
    rationale.push(
      "This is a summary bill — codes and line charges are what make a real audit possible. Request the itemized bill first (it's free, and providers must supply it).",
    );
    return { primary, stacked: tracks, rationale, unlocks: unlocksFrom(input) };
  }
  if (flags.appeal) {
    primary = "APPEAL";
    rationale.push("A denial reversal usually outweighs line-item disputes — start the appeal clock first.");
    return { primary, stacked: take("APPEAL"), rationale, unlocks: unlocksFrom(input) };
  }
  if (contestFindings.length > 0 || gfeBreach.length > 0) {
    primary = "CONTEST";
    if (disputedCents > 0) {
      rationale.push(
        `Disputable errors total $${(disputedCents / 100).toFixed(2)} of this bill.`,
      );
    } else {
      rationale.push("The audit found disputable problems with this bill.");
    }
    return { primary, stacked: take("CONTEST"), rationale, unlocks: unlocksFrom(input) };
  }
  if (fapFindings.length > 0) {
    primary = "REDUCE";
    rationale.push("No billing errors found — but financial assistance can shrink what you owe.");
    return { primary, stacked: take("REDUCE"), rationale, unlocks: unlocksFrom(input) };
  }
  if (anchorFindings.length > 0) {
    primary = "NEGOTIATE";
    rationale.push("No errors — but the prices themselves are the leverage here.");
    return { primary, stacked: take("NEGOTIATE"), rationale, unlocks: unlocksFrom(input) };
  }

  // ---- pay gates
  const ranIds = new Set(
    input.coverage.filter((c) => c.status === "ran").map((c) => c.checkId as string),
  );
  const fullBattery = PAY_REQUIRED_CHECKS.every((id) => ranIds.has(id));
  if (fullBattery) {
    primary = "PAY";
    rationale.push(
      `All ${PAY_REQUIRED_CHECKS.length} core checks ran clean on an itemized bill — we found nothing to dispute.`,
    );
    return { primary, stacked: tracks, rationale, unlocks: unlocksFrom(input) };
  }
  primary = "CLEAN_PARTIAL";
  const ranCount = input.coverage.filter((c) => c.status === "ran").length;
  rationale.push(
    `No issues in the ${ranCount} check${ranCount === 1 ? "" : "s"} we could run — that is NOT the same as a clean bill.`,
  );
  return { primary, stacked: tracks, rationale, unlocks: unlocksFrom(input) };
}

/** Skipped checks' reasons become the "what would unlock more" list (S10/S11c). */
function unlocksFrom(input: RouterInput): string[] {
  return input.coverage
    .filter((c) => c.status === "skipped_no_data" && c.reason)
    .map((c) => `${c.checkId}: ${c.reason as string}`);
}
