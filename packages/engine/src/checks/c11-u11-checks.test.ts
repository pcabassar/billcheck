import { describe, expect, it } from "vitest";
import { runC8Gfe, GFE_TRIGGER_CENTS } from "./c8-gfe";
import { runC9Fap } from "./c9-fap";
import { runC10Benchmark, ANCHOR_MULTIPLE } from "./c10-benchmark";
import { runC13Payments } from "./c13-payments";
import { emptyRefs, engineInput, li, refs } from "../test-helpers";
import type { EngineCoverage, EngineInput } from "../types";

function coverage(overrides: Partial<EngineCoverage> = {}): EngineCoverage {
  return { c8Enabled: false, c9Enabled: false, incomeBand: null, ...overrides };
}

function input(overrides: Partial<EngineInput>, items = [li({ code: "99285", amountCents: 90000 })]): EngineInput {
  return { ...engineInput(items), ...overrides };
}

describe("C13 payments-not-credited", () => {
  it("receipt $500 + zero credits → HIGH finding $500 (plan scenario)", () => {
    const result = runC13Payments(input({ receiptsTotalCents: 50000 }), emptyRefs());
    expect(result).toHaveLength(1);
    expect(result![0].amountImpactCents).toBe(50000);
    expect(result![0].confidenceTier).toBe("high");
  });

  it("credits on the bill offset receipts (negative lines)", () => {
    const items = [
      li({ code: "99285", amountCents: 90000 }),
      li({ code: null, amountCents: -30000, descriptionRaw: "PAYMENT RECEIVED - THANK YOU" }),
    ];
    const result = runC13Payments(input({ receiptsTotalCents: 50000 }, items), emptyRefs());
    expect(result).toHaveLength(1);
    expect(result![0].amountImpactCents).toBe(20000);
  });

  it("fully credited → ran clean; sub-dollar deltas tolerated", () => {
    const items = [li({ code: null, amountCents: -50000, descriptionRaw: "PAYMENT" })];
    expect(runC13Payments(input({ receiptsTotalCents: 50000 }, items), emptyRefs())).toEqual([]);
    expect(runC13Payments(input({ receiptsTotalCents: 50050 }, items), emptyRefs())).toEqual([]);
  });

  it("skips (null) without receipts — attestation alone is not evidence", () => {
    expect(runC13Payments(input({ receiptsTotalCents: null }), emptyRefs())).toBeNull();
    expect(runC13Payments(input({}), emptyRefs())).toBeNull();
  });
});

describe("C8 GFE breach", () => {
  const enabled = coverage({ c8Enabled: true });

  it("GFE $1,000 vs bill $1,800 → finding $800 over (plan scenario; > $400 trigger)", () => {
    const result = runC8Gfe(
      input({ coverage: enabled, gfeTotalCents: 100000, billTotalCents: 180000 }),
      emptyRefs(),
    );
    expect(result).toHaveLength(1);
    expect(result![0].amountImpactCents).toBe(80000);
    expect(result![0].title).toContain("$400");
  });

  it("delta at or under the statutory $400 → ran clean", () => {
    const result = runC8Gfe(
      input({ coverage: enabled, gfeTotalCents: 100000, billTotalCents: 100000 + GFE_TRIGGER_CENTS }),
      emptyRefs(),
    );
    expect(result).toEqual([]);
  });

  it("falls back to positive line sum when the bill prints no total", () => {
    const items = [li({ code: "99285", amountCents: 180000 }), li({ code: null, amountCents: -1000 })];
    const result = runC8Gfe(
      input({ coverage: enabled, gfeTotalCents: 100000, billTotalCents: null }, items),
      emptyRefs(),
    );
    expect(result).toHaveLength(1);
    expect(result![0].amountImpactCents).toBe(80000);
  });

  it("skips without the triage flag or without a GFE", () => {
    expect(runC8Gfe(input({ gfeTotalCents: 100000, billTotalCents: 999999 }), emptyRefs())).toBeNull();
    expect(runC8Gfe(input({ coverage: enabled, billTotalCents: 999999 }), emptyRefs())).toBeNull();
  });
});

describe("C10 Medicare-multiple anchor", () => {
  it("code billed at ≥4× Medicare → MEDIUM anchor finding with NULL amount (never an asserted dollar claim)", () => {
    // helpers: 99285 rate = 18500 cents
    const items = [li({ code: "99285", codeSystem: "cpt_hcpcs", amountCents: 18500 * ANCHOR_MULTIPLE })];
    const result = runC10Benchmark(engineInput(items), refs());
    expect(result).toHaveLength(1);
    expect(result![0].confidenceTier).toBe("medium");
    expect(result![0].amountImpactCents).toBeNull();
    expect(result![0].title).toContain("anchor");
    expect(result![0].title).not.toMatch(/error/i);
  });

  it("multiplies the benchmark by units", () => {
    const items = [li({ code: "36415", codeSystem: "cpt_hcpcs", units: 3, amountCents: 300 * 3 * 2 })];
    expect(runC10Benchmark(engineInput(items), refs())).toEqual([]); // 2× < 4×
  });

  it("under the multiple → ran clean; unknown codes only → honest skip", () => {
    expect(
      runC10Benchmark(engineInput([li({ code: "99285", codeSystem: "cpt_hcpcs", amountCents: 20000 })]), refs()),
    ).toEqual([]);
    expect(
      runC10Benchmark(engineInput([li({ code: "ZZZZZ", codeSystem: "cpt_hcpcs", amountCents: 20000 })]), refs()),
    ).toBeNull();
  });

  it("revenue-code lines never anchor (PFS is professional-only)", () => {
    expect(
      runC10Benchmark(engineInput([li({ code: "0450", codeSystem: "revenue", amountCents: 999999 })]), refs()),
    ).toBeNull();
  });
});

describe("C9 FAP screening", () => {
  const eligible = coverage({ c9Enabled: true, incomeBand: "under_2x_fpl" });

  it("band fully under the free threshold → MEDIUM 'likely eligible for free care'", () => {
    const result = runC9Fap(
      input({ coverage: eligible, providerName: "St. Mary's Medical Center" }),
      refs(),
    );
    expect(result).toHaveLength(1);
    expect(result![0].confidenceTier).toBe("medium");
    expect(result![0].title).toContain("free");
    expect(result![0].amountImpactCents).toBeNull();
  });

  it("threshold inside the band → REVIEW 'may qualify'", () => {
    const result = runC9Fap(
      input({
        coverage: coverage({ c9Enabled: true, incomeBand: "2x_to_4x_fpl" }),
        providerName: "Lakewood Urgent Care", // discount ≤ 3× FPL, band [2,4)
      }),
      refs(),
    );
    expect(result).toHaveLength(1);
    expect(result![0].confidenceTier).toBe("review");
    expect(result![0].title).toContain("May qualify");
  });

  it("high band over every threshold → ran clean", () => {
    const result = runC9Fap(
      input({ coverage: coverage({ c9Enabled: true, incomeBand: "over_4x_fpl" }), providerName: "St. Mary's Medical Center" }),
      refs(),
    );
    expect(result).toEqual([]);
  });

  it("hospital not in the set → skip (coverage map says 'tell us your hospital')", () => {
    expect(
      runC9Fap(input({ coverage: eligible, providerName: "Unknown Regional Hospital" }), refs()),
    ).toBeNull();
  });

  it("matching is punctuation/case-insensitive and substring-tolerant", () => {
    const result = runC9Fap(
      input({ coverage: eligible, providerName: "ST MARYS MEDICAL CENTER - EMERGENCY DEPT" }),
      refs(),
    );
    expect(result).toHaveLength(1);
  });

  it("skips without the flag, the band, or any seeded policies", () => {
    expect(runC9Fap(input({ providerName: "St. Mary's Medical Center" }), refs())).toBeNull();
    expect(runC9Fap(input({ coverage: eligible, providerName: "St. Mary's Medical Center" }), emptyRefs())).toBeNull();
  });
});
