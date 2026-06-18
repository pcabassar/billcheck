/**
 * Verified-savings diff (U14, deepening data #1 + review A2).
 *
 * verified savings = frozen baseline (snapshotted at verdict) MINUS the
 * latest completed-parse corrected statement — recomputed deterministically
 * from those two fixed points, never accumulated across uploads.
 *
 * Anti-phantom gates (A2): a re-photo of the same statement must never mint
 * savings —
 *  - byte-identical uploads are rejected upstream (content hash);
 *  - identical line-item multisets (same codes/amounts/units) yield none;
 *  - deltas below the floor (max($25, 1% of baseline)) yield none;
 *  - a HIGHER corrected total yields none (honest copy upstream).
 */

export interface BaselineSnapshot {
  /** Original bill total in cents at verdict time (printed totals summed). */
  billTotalCents: number;
  /** Multiset fingerprint of the original line items. */
  lineFingerprints: string[];
  snapshotAt: string;
}

export interface CorrectedStatement {
  printedTotalCents: number | null;
  contentHash: string | null;
  /** The ORIGINAL document's content hash, for the byte-identical gate. */
  originalContentHash: string | null;
  lineFingerprints: string[];
}

export type SavingsDiff =
  | { verified: true; savingsCents: number }
  | { verified: false; reason:
      | "no_baseline"
      | "no_corrected_total"
      | "byte_identical"
      | "same_line_items"
      | "below_floor"
      | "higher_total" };

const ABSOLUTE_FLOOR_CENTS = 2500;
const RELATIVE_FLOOR = 0.01;

/** Stable per-line fingerprint: code|amount|units (order-independent multiset). */
export function lineFingerprint(li: {
  code: string | null;
  amountCents: number | null;
  units: number | null;
}): string {
  return `${li.code ?? ""}|${li.amountCents ?? ""}|${li.units ?? ""}`;
}

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1);
  for (const y of b) {
    const c = counts.get(y);
    if (!c) return false;
    counts.set(y, c - 1);
  }
  return true;
}

export function computeSavings(
  baseline: BaselineSnapshot | null,
  corrected: CorrectedStatement,
): SavingsDiff {
  if (!baseline || baseline.billTotalCents <= 0) return { verified: false, reason: "no_baseline" };
  if (corrected.printedTotalCents === null) return { verified: false, reason: "no_corrected_total" };
  if (
    corrected.contentHash !== null &&
    corrected.originalContentHash !== null &&
    corrected.contentHash === corrected.originalContentHash
  ) {
    return { verified: false, reason: "byte_identical" };
  }
  if (
    corrected.lineFingerprints.length > 0 &&
    sameMultiset(baseline.lineFingerprints, corrected.lineFingerprints)
  ) {
    return { verified: false, reason: "same_line_items" };
  }

  const delta = baseline.billTotalCents - corrected.printedTotalCents;
  if (delta < 0) return { verified: false, reason: "higher_total" };
  const floor = Math.max(ABSOLUTE_FLOOR_CENTS, Math.round(baseline.billTotalCents * RELATIVE_FLOOR));
  if (delta < floor) return { verified: false, reason: "below_floor" };
  return { verified: true, savingsCents: delta };
}

/** Anchored PWYW suggestion: ~10% of verified savings, floored at $1. */
export function suggestedTipCents(savingsCents: number): number {
  return Math.max(100, Math.round(savingsCents * 0.1));
}
