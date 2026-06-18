import type { EngineFinding, EngineInput, ReferenceData } from "../types";

/**
 * C10 — Medicare-multiple benchmark (v1, U11).
 *
 * HONESTY CONTRACT: this is a NEGOTIATION ANCHOR, never an "error". Charging
 * above Medicare is legal and universal; what matters is the multiple. Lines
 * billed at ≥ 4× the Medicare PFS national rate get a MEDIUM finding whose
 * title says "negotiation anchor" — and amountImpactCents is null because no
 * specific dollar amount is "owed back" (asserting one would be the
 * phantom-savings sin the plan bans).
 *
 * Facility-only lines (revenue codes) skip — PFS covers professional rates;
 * the coverage map shows skipped_no_data until OPPS rates land (review F5).
 */
export const CHECK_VERSION = "v1";

/** Lines at or above this multiple of Medicare get flagged as anchors. */
export const ANCHOR_MULTIPLE = 4;

export function runC10Benchmark(
  input: EngineInput,
  refs: ReferenceData,
): EngineFinding[] | null {
  if (refs.medicareRatesCents.size === 0) return null;
  const candidates = input.lineItems.filter(
    (li) =>
      li.code !== null &&
      li.codeSystem === "cpt_hcpcs" &&
      li.amountCents !== null &&
      li.amountCents > 0,
  );
  if (candidates.length === 0) return null;

  const findings: EngineFinding[] = [];
  let priced = 0;
  for (const li of candidates) {
    const rate = refs.medicareRatesCents.get(li.code as string);
    if (rate === undefined || rate <= 0) continue;
    priced += 1;
    const units = li.units !== null && li.units > 0 ? li.units : 1;
    const benchmark = rate * units;
    const multiple = (li.amountCents as number) / benchmark;
    if (multiple < ANCHOR_MULTIPLE) continue;
    findings.push({
      checkId: "C10",
      checkVersion: CHECK_VERSION,
      refVersions: { medicare_rates: refs.versions.medicareRates },
      confidenceTier: "medium",
      // Anchor, not a dispute amount — never assert dollars owed (A2).
      amountImpactCents: null,
      title: `Negotiation anchor: code ${li.code} billed at ${multiple.toFixed(1)}× the Medicare rate`,
      evidence: [
        {
          documentId: li.documentId,
          lineItemId: li.id,
          note: `billed ${((li.amountCents as number) / 100).toFixed(2)} vs Medicare ${(benchmark / 100).toFixed(2)} for ${units} unit(s)`,
        },
      ],
      evidenceKey: `C10:${li.code}:${li.documentId}:${li.id}`,
    });
  }
  // No line had a known rate → honest skip, not a clean pass.
  if (priced === 0) return null;
  return findings;
}
