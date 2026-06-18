import { describe, expect, it } from "vitest";
import { computeSavings, lineFingerprint, suggestedTipCents, type BaselineSnapshot } from "./savings-diff";

function baseline(overrides: Partial<BaselineSnapshot> = {}): BaselineSnapshot {
  return {
    billTotalCents: 941200,
    lineFingerprints: ["99285|90000|1", "71046|49800|2"],
    snapshotAt: "2026-06-12T00:00:00Z",
    ...overrides,
  };
}

describe("computeSavings (frozen baseline, anti-phantom gates)", () => {
  it("corrected $7,702 vs original $9,412 → verified $1,710; suggested tip $171 (plan scenario)", () => {
    const diff = computeSavings(baseline(), {
      printedTotalCents: 770200,
      contentHash: "b",
      originalContentHash: "a",
      lineFingerprints: ["99285|90000|1"],
    });
    expect(diff).toEqual({ verified: true, savingsCents: 171000 });
    expect(suggestedTipCents(171000)).toBe(17100);
  });

  it("byte-identical re-upload → no savings (A2)", () => {
    const diff = computeSavings(baseline(), {
      printedTotalCents: 100,
      contentHash: "same",
      originalContentHash: "same",
      lineFingerprints: [],
    });
    expect(diff).toEqual({ verified: false, reason: "byte_identical" });
  });

  it("same statement re-photographed (different bytes, identical lines) → no phantom savings (A2)", () => {
    const diff = computeSavings(baseline(), {
      printedTotalCents: 770200,
      contentHash: "different",
      originalContentHash: "a",
      lineFingerprints: ["71046|49800|2", "99285|90000|1"], // same multiset, different order
    });
    expect(diff).toEqual({ verified: false, reason: "same_line_items" });
  });

  it("corrected statement HIGHER than original → no savings", () => {
    const diff = computeSavings(baseline(), {
      printedTotalCents: 999999,
      contentHash: "b",
      originalContentHash: "a",
      lineFingerprints: ["x|1|1"],
    });
    expect(diff).toEqual({ verified: false, reason: "higher_total" });
  });

  it("delta below max($25, 1%) floor → no savings", () => {
    // 1% of 9412.00 = 94.12 → floor 9412 cents
    const diff = computeSavings(baseline(), {
      printedTotalCents: 941200 - 9000,
      contentHash: "b",
      originalContentHash: "a",
      lineFingerprints: ["x|1|1"],
    });
    expect(diff).toEqual({ verified: false, reason: "below_floor" });
  });

  it("deterministic: same inputs, same figure — recomputed, never accumulated", () => {
    const corrected = {
      printedTotalCents: 770200,
      contentHash: "b",
      originalContentHash: "a",
      lineFingerprints: ["x|1|1"],
    };
    const a = computeSavings(baseline(), corrected);
    const b = computeSavings(baseline(), corrected);
    expect(a).toEqual(b);
  });

  it("missing baseline or corrected total → honest non-verification", () => {
    expect(computeSavings(null, { printedTotalCents: 1, contentHash: null, originalContentHash: null, lineFingerprints: [] }))
      .toEqual({ verified: false, reason: "no_baseline" });
    expect(computeSavings(baseline(), { printedTotalCents: null, contentHash: null, originalContentHash: null, lineFingerprints: [] }))
      .toEqual({ verified: false, reason: "no_corrected_total" });
  });

  it("lineFingerprint is stable across null fields", () => {
    expect(lineFingerprint({ code: null, amountCents: null, units: null })).toBe("||");
    expect(lineFingerprint({ code: "99285", amountCents: 90000, units: 1 })).toBe("99285|90000|1");
  });
});
