import { describe, expect, it } from "vitest";
import { routeVerdict, type RouterFinding, type RouterFlags, type RouterInput } from "./router";
import type { CoverageEntry } from "@billcheck/shared";

/**
 * Router test matrix (plan U12 verification): every verdict × coverage
 * combination the spec's decision index defines for V0.
 */

function cov(ran: string[], skipped: string[] = []): CoverageEntry[] {
  const all = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13"];
  return all.map((id) => ({
    checkId: id as CoverageEntry["checkId"],
    status: ran.includes(id) ? "ran" : skipped.includes(id) ? "skipped_no_data" : "not_yet_available",
    reason: skipped.includes(id) ? `needs data for ${id}` : null,
  }));
}

function finding(checkId: string, overrides: Partial<RouterFinding> = {}): RouterFinding {
  return { checkId, confidenceTier: "high", amountImpactCents: 10000, ...overrides };
}

function route(overrides: Partial<RouterInput>): ReturnType<typeof routeVerdict> {
  return routeVerdict({
    itemized: true,
    flags: {},
    findings: [],
    coverage: cov(["C3", "C4", "C5", "C10"]),
    ...overrides,
  });
}

describe("D10 router v0.2 — primary cascade", () => {
  it("itemized + findings → CONTEST with stacked REDUCE when FAP-eligible (plan scenario)", () => {
    const r = route({
      findings: [finding("C3"), finding("C9", { confidenceTier: "medium", amountImpactCents: null })],
    });
    expect(r.primary).toBe("CONTEST");
    expect(r.stacked.map((t) => t.kind)).toContain("REDUCE");
  });

  it("summary insured bill, checks ran, nothing found → GET_ITEMIZED, never PAY or 'checks out'", () => {
    const r = route({ itemized: false, coverage: cov(["C3", "C4", "C5", "C10"]) });
    expect(r.primary).toBe("GET_ITEMIZED");
    expect(r.rationale.join(" ")).toContain("itemized");
  });

  it("summary bill WITH findings still routes GET_ITEMIZED first, CONTEST stacked", () => {
    const r = route({ itemized: false, findings: [finding("C3")] });
    expect(r.primary).toBe("GET_ITEMIZED");
    expect(r.stacked.map((t) => t.kind)).toContain("CONTEST");
  });

  it("itemized, full battery, clean → PAY with honest count (S11b)", () => {
    const r = route({});
    expect(r.primary).toBe("PAY");
    expect(r.stacked).toEqual([]);
  });

  it("PAY gate: partial battery + clean → CLEAN_PARTIAL with unlock list, never PAY", () => {
    const r = route({ coverage: cov(["C3", "C4", "C5"], ["C10", "C9"]) });
    expect(r.primary).toBe("CLEAN_PARTIAL");
    expect(r.rationale.join(" ")).toContain("NOT the same");
    expect(r.unlocks.length).toBe(2);
  });

  it("denial=yes → APPEAL handoff with deadline warning; CONTEST stacks under it", () => {
    const r = route({ flags: { appeal: true }, findings: [finding("C4")] });
    expect(r.primary).toBe("APPEAL");
    const appeal = [{ kind: "APPEAL" }, ...r.stacked].find((t) => t.kind === "CONTEST");
    expect(appeal).toBeTruthy();
  });

  it("already-paid premise + C13 → REJECT (S11e) citing the uncredited payment", () => {
    const r = route({ flags: { rejectPremise: true }, findings: [finding("C13")] });
    expect(r.primary).toBe("REJECT");
    expect(r.rationale.join(" ")).toContain("payments");
  });

  it("already-paid WITHOUT a C13 finding never REJECTs (evidence standard)", () => {
    const r = route({ flags: { rejectPremise: true } });
    expect(r.primary).toBe("PAY"); // full battery clean, no findings
  });

  it("collections → VALIDATE primary with the FDCPA 30-day note, even over CONTEST", () => {
    const r = route({ flags: { validate: true }, findings: [finding("C3")] });
    expect(r.primary).toBe("VALIDATE");
    expect(r.stacked[0].kind).toBe("CONTEST");
  });

  it("wait flag (escaped S5) → WAIT primary; findings stack as CONTEST", () => {
    const r = route({ flags: { wait: true }, findings: [finding("C5")] });
    expect(r.primary).toBe("WAIT");
    expect(r.stacked.map((t) => t.kind)).toContain("CONTEST");
  });

  it("REJECT premise outranks even collections", () => {
    const r = route({
      flags: { rejectPremise: true, validate: true },
      findings: [finding("C13")],
    });
    expect(r.primary).toBe("REJECT");
    expect(r.stacked[0].kind).toBe("VALIDATE");
  });

  it("C9-only → REDUCE primary; C10-only → NEGOTIATE primary; both → REDUCE primary, NEGOTIATE stacked", () => {
    expect(route({ findings: [finding("C9", { confidenceTier: "medium", amountImpactCents: null })] }).primary).toBe("REDUCE");
    expect(route({ findings: [finding("C10", { confidenceTier: "medium", amountImpactCents: null })] }).primary).toBe("NEGOTIATE");
    const both = route({
      findings: [
        finding("C9", { confidenceTier: "medium", amountImpactCents: null }),
        finding("C10", { confidenceTier: "medium", amountImpactCents: null }),
      ],
    });
    expect(both.primary).toBe("REDUCE");
    expect(both.stacked.map((t) => t.kind)).toContain("NEGOTIATE");
  });

  it("C8 GFE breach alone → CONTEST with the 120-day PPDR note", () => {
    const r = route({ findings: [finding("C8", { amountImpactCents: 80000 })] });
    expect(r.primary).toBe("CONTEST");
    expect(r.rationale.join(" ")).toBeTruthy();
  });

  it("review-tier contest findings never drive CONTEST on their own", () => {
    const r = route({ findings: [finding("C3", { confidenceTier: "review" })] });
    expect(r.primary).toBe("PAY");
  });

  it("stacked tracks order by statutory urgency: VALIDATE before APPEAL before CONTEST before REDUCE", () => {
    const r = route({
      flags: { rejectPremise: true, validate: true, appeal: true },
      findings: [
        finding("C13"),
        finding("C3"),
        finding("C9", { confidenceTier: "medium", amountImpactCents: null }),
      ],
    });
    expect(r.primary).toBe("REJECT");
    const order = r.stacked.map((t) => t.kind);
    expect(order.indexOf("VALIDATE")).toBeLessThan(order.indexOf("APPEAL"));
    expect(order.indexOf("APPEAL")).toBeLessThan(order.indexOf("CONTEST"));
    expect(order.indexOf("CONTEST")).toBeLessThan(order.indexOf("REDUCE"));
  });

  it("CONTEST rationale sums only contest-check dollars (anchors never add)", () => {
    const r = route({
      findings: [
        finding("C3", { amountImpactCents: 49800 }),
        finding("C5", { amountImpactCents: 9000 }),
        finding("C10", { confidenceTier: "medium", amountImpactCents: null }),
      ],
    });
    expect(r.primary).toBe("CONTEST");
    expect(r.rationale.join(" ")).toContain("$588.00");
  });
});
