import type { EngineFinding, EngineInput, ReferenceData } from "../types";

/**
 * C8 — Good Faith Estimate breach (v1, U11).
 *
 * No Surprises Act: a self-pay/uninsured patient whose final bill exceeds
 * their written GFE by more than $400 may take the bill to the federal
 * Patient-Provider Dispute Resolution (PPDR) process. The $400 trigger is
 * statutory, not a heuristic.
 *
 * Runs only when triage says self-pay-with-GFE (coverage.c8Enabled) AND a
 * GFE document's printed total is available. The bill side prefers the
 * printed bill total; falls back to the positive line-item sum.
 */
export const CHECK_VERSION = "v1";

/** Statutory PPDR eligibility trigger (No Surprises Act). */
export const GFE_TRIGGER_CENTS = 400_00;

export function runC8Gfe(
  input: EngineInput,
  _refs: ReferenceData,
): EngineFinding[] | null {
  if (input.coverage?.c8Enabled !== true) return null;
  const gfe = input.gfeTotalCents;
  if (gfe == null || gfe < 0) return null;

  const lineSum = input.lineItems.reduce(
    (sum, li) => sum + (li.amountCents !== null && li.amountCents > 0 ? li.amountCents : 0),
    0,
  );
  const billTotal = input.billTotalCents ?? (lineSum > 0 ? lineSum : null);
  if (billTotal == null) return null;

  const delta = billTotal - gfe;
  if (delta <= GFE_TRIGGER_CENTS) return [];

  return [
    {
      checkId: "C8",
      checkVersion: CHECK_VERSION,
      refVersions: {},
      confidenceTier: "high",
      amountImpactCents: delta,
      title: `Bill exceeds your Good Faith Estimate by $${(delta / 100).toFixed(2)} — over the $400 federal dispute trigger`,
      evidence: [
        {
          documentId: input.lineItems[0]?.documentId ?? "",
          lineItemId: null,
          note: `billed ${(billTotal / 100).toFixed(2)} vs estimated ${(gfe / 100).toFixed(2)} (PPDR-eligible)`,
        },
      ],
      evidenceKey: `C8:${billTotal}:${gfe}`,
    },
  ];
}
