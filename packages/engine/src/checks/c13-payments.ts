import type { EngineFinding, EngineInput, ReferenceData } from "../types";

/**
 * C13 — payments not credited (v1, U11).
 *
 * The user's PROVEN payments (printed receipt totals, summed by the audit
 * step) vs. what the bill actually credits (negative/credit line amounts).
 * Paying a bill that doesn't credit a prior payment is the REJECT-premise
 * class: the bill's foundation is wrong before any line is examined.
 *
 * Skips (null) when no receipts were provided — attested-but-undocumented
 * payments produce guidance copy elsewhere, never a finding (evidence
 * standard: findings cite documents).
 */
export const CHECK_VERSION = "v1";

/** Ignore sub-dollar mismatches between receipts and credits. */
const TOLERANCE_CENTS = 100;

export function runC13Payments(
  input: EngineInput,
  _refs: ReferenceData,
): EngineFinding[] | null {
  const receipts = input.receiptsTotalCents;
  if (receipts == null || receipts <= 0) return null;

  // Credits = negative line amounts on the bill ("payment received",
  // adjustments). A bill with no credit lines credits nothing.
  const creditsCents = input.lineItems.reduce(
    (sum, li) => sum + (li.amountCents !== null && li.amountCents < 0 ? -li.amountCents : 0),
    0,
  );

  const uncredited = receipts - creditsCents;
  if (uncredited <= TOLERANCE_CENTS) return [];

  return [
    {
      checkId: "C13",
      checkVersion: CHECK_VERSION,
      refVersions: {},
      confidenceTier: "high",
      amountImpactCents: uncredited,
      title: `Payment not credited: your receipts total more than the bill credits by $${(uncredited / 100).toFixed(2)}`,
      evidence: [
        {
          documentId: input.lineItems[0]?.documentId ?? "",
          lineItemId: null,
          note: `receipts total ${(receipts / 100).toFixed(2)} vs credits on the bill ${(creditsCents / 100).toFixed(2)}`,
        },
      ],
      evidenceKey: `C13:${receipts}:${creditsCents}`,
    },
  ];
}
