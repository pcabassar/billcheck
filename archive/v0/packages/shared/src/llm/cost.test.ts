import { describe, expect, it } from "vitest";
import { estimateCostCents, rateFor, sumCostCents } from "./cost";

describe("estimateCostCents", () => {
  it("prices a sonnet call by token usage", () => {
    // 1M in @ 300c + 1M out @ 1500c = 1800c
    expect(estimateCostCents("claude-sonnet-4-6", 1_000_000, 1_000_000)).toBe(1800);
    // realistic parse: ~3.5k in, ~1k out ≈ 1.05c + 1.5c
    expect(estimateCostCents("claude-sonnet-4-6", 3500, 1000)).toBeCloseTo(1.05 + 1.5, 5);
  });

  it("treats null tokens as zero", () => {
    expect(estimateCostCents("claude-sonnet-4-6", null, null)).toBe(0);
    expect(estimateCostCents("claude-sonnet-4-6", 1_000_000, null)).toBe(300);
  });

  it("falls back to the most expensive rate for unknown models (never under-counts)", () => {
    const unknown = estimateCostCents("some-future-model", 1_000_000, 1_000_000);
    const known = estimateCostCents("claude-sonnet-4-6", 1_000_000, 1_000_000);
    expect(unknown).toBeGreaterThanOrEqual(known);
    expect(rateFor("some-future-model")).toEqual(rateFor("claude-fable-5"));
  });
});

describe("sumCostCents", () => {
  it("sums across rows", () => {
    const rows = [
      { model_id: "claude-sonnet-4-6", tokens_in: 1_000_000, tokens_out: 0 },
      { model_id: "claude-sonnet-4-6", tokens_in: 0, tokens_out: 1_000_000 },
    ];
    expect(sumCostCents(rows)).toBe(300 + 1500);
  });

  it("empty → 0", () => {
    expect(sumCostCents([])).toBe(0);
  });
});
