import { describe, expect, it } from "vitest";
import { CHECK_VERSION, runC4Ncci } from "./c4-ncci";
import { emptyRefs, engineInput, li, refs } from "../test-helpers";

describe("C4 NCCI PTP", () => {
  it("fires HIGH on a PTP pair on the same document + date, amount = lesser line", () => {
    const comprehensive = li({ code: "80053", dateOfService: "2026-05-03", amountCents: 9000 });
    const component = li({ code: "80048", dateOfService: "2026-05-03", amountCents: 4500 });
    const result = runC4Ncci(engineInput([comprehensive, component]), refs());

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    const finding = result![0];
    expect(finding.checkId).toBe("C4");
    expect(finding.checkVersion).toBe(CHECK_VERSION);
    expect(finding.confidenceTier).toBe("high");
    expect(finding.amountImpactCents).toBe(4500);
    expect(finding.evidenceKey).toBe("C4:80048|80053:2026-05-03:doc-1");
    expect(finding.refVersions).toEqual({ ncci_ptp: "TEST1" });
    expect(finding.evidence.map((e) => e.lineItemId)).toEqual([
      comprehensive.id,
      component.id,
    ]);
  });

  it("matches regardless of line order (reverse orientation) with a stable evidence key", () => {
    const component = li({ code: "80048", dateOfService: "2026-05-03", amountCents: 4500 });
    const comprehensive = li({ code: "80053", dateOfService: "2026-05-03", amountCents: 9000 });
    const result = runC4Ncci(engineInput([component, comprehensive]), refs());
    expect(result).toHaveLength(1);
    expect(result![0].evidenceKey).toBe("C4:80048|80053:2026-05-03:doc-1");
    expect(result![0].amountImpactCents).toBe(4500);
    // The comprehensive (column 1) code is identified correctly either way.
    expect(result![0].title).toContain("80048 should not be billed separately with 80053");
  });

  it("does not fire across different documents", () => {
    const a = li({ code: "80053", documentId: "doc-fac" });
    const b = li({ code: "80048", documentId: "doc-pro" });
    expect(runC4Ncci(engineInput([a, b]), refs())).toEqual([]);
  });

  it("does not fire across different dates of service", () => {
    const a = li({ code: "80053", dateOfService: "2026-05-01" });
    const b = li({ code: "80048", dateOfService: "2026-05-02" });
    expect(runC4Ncci(engineInput([a, b]), refs())).toEqual([]);
  });

  it("dedupes repeat line combinations of the same pair into one finding", () => {
    const lines = [
      li({ code: "80053", amountCents: 9000 }),
      li({ code: "80053", amountCents: 9000 }),
      li({ code: "80048", amountCents: 4500 }),
    ];
    const result = runC4Ncci(engineInput(lines), refs());
    expect(result).toHaveLength(1);
  });

  it("returns null when no line items carry codes", () => {
    expect(runC4Ncci(engineInput([li({ code: null }), li({ code: null })]), refs())).toBeNull();
  });

  it("returns null when the NCCI reference set is empty", () => {
    const lines = [li({ code: "80053" }), li({ code: "80048" })];
    expect(runC4Ncci(engineInput(lines), emptyRefs())).toBeNull();
  });

  it("returns an empty list (ran) when codes exist but no pair matches", () => {
    const lines = [li({ code: "99213" }), li({ code: "36415" })];
    expect(runC4Ncci(engineInput(lines), refs())).toEqual([]);
  });

  it("reports a null amount when both lines lack amounts", () => {
    const lines = [
      li({ code: "80053", amountCents: null }),
      li({ code: "80048", amountCents: null }),
    ];
    const result = runC4Ncci(engineInput(lines), refs());
    expect(result).toHaveLength(1);
    expect(result![0].amountImpactCents).toBeNull();
  });

  it("uses the only known amount when one line lacks an amount", () => {
    const lines = [
      li({ code: "80053", amountCents: 9000 }),
      li({ code: "80048", amountCents: null }),
    ];
    const result = runC4Ncci(engineInput(lines), refs());
    expect(result![0].amountImpactCents).toBe(9000);
  });
});
