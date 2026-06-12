import { describe, expect, it } from "vitest";
import { CheckId } from "@billcheck/shared";
import { CHECK_VERSIONS, ENGINE_VERSION, runEngine } from "./run";
import { emptyRefs, engineInput, li, refs } from "./test-helpers";

describe("runEngine", () => {
  it("always produces a 13-entry coverage map in canonical check order", () => {
    const result = runEngine(engineInput([]), refs());
    expect(result.coverage).toHaveLength(13);
    expect(result.coverage.map((c) => c.checkId)).toEqual(CheckId.options);
  });

  it("reports skipped_no_data with a reason for C3/C4/C5 on an empty input", () => {
    const result = runEngine(engineInput([]), refs());
    for (const id of ["C3", "C4", "C5"] as const) {
      const entry = result.coverage.find((c) => c.checkId === id);
      expect(entry?.status).toBe("skipped_no_data");
      expect(entry?.reason).toBeTruthy();
    }
    expect(result.findings).toEqual([]);
  });

  it("marks unimplemented checks not_yet_available, never silently absent", () => {
    const result = runEngine(engineInput([]), refs());
    const others = result.coverage.filter(
      (c) => !["C3", "C4", "C5"].includes(c.checkId),
    );
    expect(others).toHaveLength(10);
    for (const entry of others) expect(entry.status).toBe("not_yet_available");
  });

  it("stamps engine and check versions for reproducibility", () => {
    const result = runEngine(engineInput([]), refs());
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.checkVersions).toEqual(CHECK_VERSIONS);
    expect(Object.keys(CHECK_VERSIONS).sort()).toEqual(["C3", "C4", "C5"]);
  });

  it("concatenates findings across checks in C3 → C4 → C5 order", () => {
    const lines = [
      // C3: duplicate pair
      li({ code: "36415", amountCents: 1500 }),
      li({ code: "36415", amountCents: 1500 }),
      // C4: PTP pair on the same doc/date
      li({ code: "80053", amountCents: 9000 }),
      li({ code: "80048", amountCents: 4500 }),
      // C5: exceeds MUE (J0696 max 4)
      li({ code: "J0696", units: 6, amountCents: 9000 }),
    ];
    const result = runEngine(engineInput(lines), refs());
    expect(result.findings.map((f) => f.checkId)).toEqual(["C3", "C4", "C5"]);
    for (const id of ["C3", "C4", "C5"] as const) {
      expect(result.coverage.find((c) => c.checkId === id)?.status).toBe("ran");
    }
  });

  it("treats empty reference sets as skipped_no_data for C4/C5 but not C3", () => {
    const lines = [
      li({ code: "36415", amountCents: 1500 }),
      li({ code: "36415", amountCents: 1500 }),
    ];
    const result = runEngine(engineInput(lines), emptyRefs());
    expect(result.coverage.find((c) => c.checkId === "C3")?.status).toBe("ran");
    expect(result.coverage.find((c) => c.checkId === "C4")?.status).toBe("skipped_no_data");
    expect(result.coverage.find((c) => c.checkId === "C5")?.status).toBe("skipped_no_data");
    expect(result.findings).toHaveLength(1); // the C3 duplicate still fires
  });
});
