import { describe, expect, it } from "vitest";
import { computeRoutingFlags, TriageAnswers, type TriState } from "./triage";

/**
 * Table-driven contract for triage routing (U10 verification): each answer
 * combination the plan names must produce the documented flags.
 */

function answers(overrides: Partial<TriageAnswers> = {}): TriageAnswers {
  return TriageAnswers.parse({
    insured: "not_sure",
    adjudicated: "not_sure",
    collections: "not_sure",
    denied: "not_sure",
    alreadyPaid: "not_sure",
    otherPayer: "not_sure",
    state: null,
    incomeBand: null,
    gfeReceived: "not_sure",
    ...overrides,
  });
}

describe("computeRoutingFlags (D4/D5/D6/D14/D15 routing table)", () => {
  it("pre-adjudication insured → WAIT (the S5 screen, audit deferred)", () => {
    const flags = computeRoutingFlags(answers({ insured: "yes", adjudicated: "no" }));
    expect(flags.wait).toBe(true);
  });

  it("WAIT never triggers on uncertainty — not_sure runs the audit with degraded coverage", () => {
    expect(computeRoutingFlags(answers({ insured: "yes", adjudicated: "not_sure" })).wait).toBe(false);
    expect(computeRoutingFlags(answers({ insured: "not_sure", adjudicated: "no" })).wait).toBe(false);
  });

  it("collections beats WAIT — a collector's clock outranks the EOB wait", () => {
    const flags = computeRoutingFlags(
      answers({ insured: "yes", adjudicated: "no", collections: "yes" }),
    );
    expect(flags.wait).toBe(false);
    expect(flags.validate).toBe(true);
  });

  it("collections=yes → VALIDATE flag (urgent copy; letter gated on the notice in U13)", () => {
    expect(computeRoutingFlags(answers({ collections: "yes" })).validate).toBe(true);
    expect(computeRoutingFlags(answers({ collections: "no" })).validate).toBe(false);
    expect(computeRoutingFlags(answers({ collections: "not_sure" })).validate).toBe(false);
  });

  it("denial=yes → APPEAL flag (handoff in U12, never letter generation)", () => {
    expect(computeRoutingFlags(answers({ denied: "yes" })).appeal).toBe(true);
    expect(computeRoutingFlags(answers({ denied: "not_sure" })).appeal).toBe(false);
  });

  it("already-paid=yes → REJECT-premise flag (C13 arms it)", () => {
    expect(computeRoutingFlags(answers({ alreadyPaid: "yes" })).rejectPremise).toBe(true);
  });

  it("self-pay + GFE in hand → C8 enabled; insured or GFE-less self-pay → not", () => {
    expect(
      computeRoutingFlags(answers({ insured: "no", gfeReceived: "yes" })).c8Enabled,
    ).toBe(true);
    expect(
      computeRoutingFlags(answers({ insured: "yes", gfeReceived: "yes" })).c8Enabled,
    ).toBe(false);
    expect(
      computeRoutingFlags(answers({ insured: "no", gfeReceived: "not_sure" })).c8Enabled,
    ).toBe(false);
  });

  it("income band given → C9 (FAP screening) enabled; skip/absent → not", () => {
    expect(computeRoutingFlags(answers({ incomeBand: "under_2x_fpl" })).c9Enabled).toBe(true);
    expect(computeRoutingFlags(answers({ incomeBand: "skip" })).c9Enabled).toBe(false);
    expect(computeRoutingFlags(answers({ incomeBand: null })).c9Enabled).toBe(false);
  });

  it("other payer → guidance only, never blocks the audit", () => {
    const flags = computeRoutingFlags(answers({ otherPayer: "yes" }));
    expect(flags.otherPayerGuidance).toBe(true);
    expect(flags.wait).toBe(false);
  });

  it("all-not_sure (skip everything) → zero gating flags, audit proceeds", () => {
    const flags = computeRoutingFlags(answers());
    expect(flags).toEqual({
      wait: false,
      validate: false,
      appeal: false,
      rejectPremise: false,
      c8Enabled: false,
      c9Enabled: false,
      otherPayerGuidance: false,
    });
  });
});

describe("TriageAnswers schema", () => {
  it("rejects unknown states and malformed bands", () => {
    expect(() => answers({ state: "XYZ" as never })).toThrow();
    expect(() => answers({ incomeBand: "rich" as never })).toThrow();
  });

  it("accepts a fully-specified honest answer set", () => {
    expect(
      answers({ insured: "yes", adjudicated: "yes", state: "NY", incomeBand: "2x_to_4x_fpl" }),
    ).toBeTruthy();
  });
});
