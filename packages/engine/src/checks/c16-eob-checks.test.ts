import { describe, expect, it } from "vitest";
import { runC1Balance } from "./c1-balance";
import { runC2Submission } from "./c2-submission";
import { runC6Carc } from "./c6-carc";
import { emptyRefs, engineInput, li, refs } from "../test-helpers";
import type { EngineInput } from "../types";

function eob(overrides: Partial<NonNullable<EngineInput["eob"]>> = {}): NonNullable<EngineInput["eob"]> {
  return {
    patientResponsibilityCents: null,
    allowedCents: null,
    planPaidCents: null,
    dateOfService: null,
    carcCodes: [],
    ...overrides,
  };
}

function input(overrides: Partial<EngineInput>, items = [li({ code: "99285", amountCents: 306200, dateOfService: "2026-05-01" })]): EngineInput {
  return { ...engineInput(items), ...overrides };
}

describe("C1 balance billing vs EOB", () => {
  it("bill $3,062 vs EOB patient responsibility $1,850 → HIGH finding $1,212 (plan scenario)", () => {
    const result = runC1Balance(
      input({ billTotalCents: 306200, eob: eob({ patientResponsibilityCents: 185000 }) }),
      emptyRefs(),
    );
    expect(result).toHaveLength(1);
    expect(result![0].amountImpactCents).toBe(121200);
    expect(result![0].confidenceTier).toBe("high");
  });

  it("EOB for a different DOS → review-tier mismatch flag, never a false C1 (plan edge)", () => {
    const result = runC1Balance(
      input({
        billTotalCents: 306200,
        eob: eob({ patientResponsibilityCents: 185000, dateOfService: "2026-06-09" }),
      }),
      emptyRefs(),
    );
    expect(result).toHaveLength(1);
    expect(result![0].confidenceTier).toBe("review");
    expect(result![0].amountImpactCents).toBeNull();
    expect(result![0].title).toContain("different date");
  });

  it("matching DOS compares normally", () => {
    const result = runC1Balance(
      input({
        billTotalCents: 306200,
        eob: eob({ patientResponsibilityCents: 185000, dateOfService: "2026-05-01" }),
      }),
      emptyRefs(),
    );
    expect(result![0].amountImpactCents).toBe(121200);
  });

  it("bill at or under the EOB figure → ran clean; no EOB → skip", () => {
    expect(
      runC1Balance(input({ billTotalCents: 185000, eob: eob({ patientResponsibilityCents: 185000 }) }), emptyRefs()),
    ).toEqual([]);
    expect(runC1Balance(input({}), emptyRefs())).toBeNull();
    expect(runC1Balance(input({ eob: eob() }), emptyRefs())).toBeNull(); // no patient-resp figure
  });
});

describe("C2 was insurance billed", () => {
  const insured = { c8Enabled: false, c9Enabled: false, incomeBand: null, insured: true } as const;

  it("insured + no EOB + gross charges with no adjustments → REVIEW finding", () => {
    const result = runC2Submission(input({ coverage: insured }), emptyRefs());
    expect(result).toHaveLength(1);
    expect(result![0].confidenceTier).toBe("review");
    expect(result![0].amountImpactCents).toBeNull();
  });

  it("an EOB in hand or credit lines on the bill → ran clean", () => {
    expect(runC2Submission(input({ coverage: insured, eob: eob() }), emptyRefs())).toEqual([]);
    const items = [li({ amountCents: 90000 }), li({ amountCents: -20000, descriptionRaw: "INSURANCE ADJUSTMENT" })];
    expect(runC2Submission(input({ coverage: insured }, items), emptyRefs())).toEqual([]);
  });

  it("not insured (or unknown) → skip", () => {
    expect(runC2Submission(input({}), emptyRefs())).toBeNull();
  });
});

describe("C6 CARC liability", () => {
  it("timely-filing code (CO-29) → HIGH 'patient not liable' finding (plan scenario)", () => {
    const result = runC6Carc(
      input({ eob: eob({ carcCodes: [{ code: "CO-29", amountCents: 45000 }] }) }),
      refs(),
    );
    expect(result).toHaveLength(1);
    expect(result![0].confidenceTier).toBe("high");
    expect(result![0].amountImpactCents).toBe(45000);
    expect(result![0].title).toContain("not liable");
  });

  it("patient-liability codes (PR-*) never fire; unknown codes never fire", () => {
    const result = runC6Carc(
      input({ eob: eob({ carcCodes: [{ code: "PR-1", amountCents: 5000 }, { code: "ZZ-99", amountCents: 1 }] }) }),
      refs(),
    );
    expect(result).toEqual([]);
  });

  it("dedupes repeated codes; normalizes case", () => {
    const result = runC6Carc(
      input({
        eob: eob({ carcCodes: [{ code: "co-45", amountCents: 1000 }, { code: "CO-45", amountCents: 2000 }] }),
      }),
      refs(),
    );
    expect(result).toHaveLength(1);
  });

  it("skips without an EOB, codes, or a CARC reference set", () => {
    expect(runC6Carc(input({}), refs())).toBeNull();
    expect(runC6Carc(input({ eob: eob() }), refs())).toBeNull();
    expect(
      runC6Carc(input({ eob: eob({ carcCodes: [{ code: "CO-29", amountCents: 1 }] }) }), emptyRefs()),
    ).toBeNull();
  });
});
