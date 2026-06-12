import { describe, expect, it } from "vitest";
import { CHECK_VERSION, runC5Mue } from "./c5-mue";
import { emptyRefs, engineInput, li, refs } from "../test-helpers";

describe("C5 MUE", () => {
  it("fires HIGH when units exceed the MUE max, amount = excess units * floored per-unit price", () => {
    const line = li({
      code: "J0696",
      units: 6,
      amountCents: 9000,
      dateOfService: "2026-05-04",
    });
    const result = runC5Mue(engineInput([line]), refs());

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    const finding = result![0];
    expect(finding.checkId).toBe("C5");
    expect(finding.checkVersion).toBe(CHECK_VERSION);
    expect(finding.confidenceTier).toBe("high");
    // per-unit = floor(9000/6) = 1500; excess = 6 - 4 = 2 → 3000
    expect(finding.amountImpactCents).toBe(3000);
    expect(finding.evidenceKey).toBe(`C5:J0696:2026-05-04:doc-1:${line.id}`);
    expect(finding.refVersions).toEqual({ mue: "TEST1" });
  });

  it("floors the per-unit price before multiplying (integer cents, never overstated)", () => {
    const line = li({ code: "36415", units: 3, amountCents: 1000 });
    const result = runC5Mue(engineInput([line]), refs());
    // per-unit = floor(1000/3) = 333; excess = 3 - 1 = 2 → 666
    expect(result![0].amountImpactCents).toBe(666);
  });

  it("does not fire when units equal the max", () => {
    const line = li({ code: "J0696", units: 4, amountCents: 6000 });
    expect(runC5Mue(engineInput([line]), refs())).toEqual([]);
  });

  it("ignores codes absent from the MUE set (ran, zero findings)", () => {
    const line = li({ code: "99999", units: 50, amountCents: 6000 });
    expect(runC5Mue(engineInput([line]), refs())).toEqual([]);
  });

  it("returns null when no line carries both a code and positive units", () => {
    const lines = [
      li({ code: "J0696", units: null }),
      li({ code: null, units: 6 }),
      li({ code: "J0696", units: 0 }),
    ];
    expect(runC5Mue(engineInput(lines), refs())).toBeNull();
  });

  it("returns null on an empty line-item list", () => {
    expect(runC5Mue(engineInput([]), refs())).toBeNull();
  });

  it("returns null when the MUE reference set is empty", () => {
    const line = li({ code: "J0696", units: 6 });
    expect(runC5Mue(engineInput([line]), emptyRefs())).toBeNull();
  });

  it("still flags exceeded units with a null amount when the line has no amount", () => {
    const line = li({ code: "J0696", units: 6, amountCents: null });
    const result = runC5Mue(engineInput([line]), refs());
    expect(result).toHaveLength(1);
    expect(result![0].amountImpactCents).toBeNull();
  });

  it("emits one finding per exceeding line (distinct evidence keys)", () => {
    const a = li({ code: "J0696", units: 6, amountCents: 9000 });
    const b = li({ code: "J0696", units: 5, amountCents: 7500 });
    const result = runC5Mue(engineInput([a, b]), refs());
    expect(result).toHaveLength(2);
    expect(new Set(result!.map((f) => f.evidenceKey)).size).toBe(2);
  });
});
